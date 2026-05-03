<script>
	// 导入领域 / store 依赖
	import game from '@sudoku/game';
	import { candidates } from '@sudoku/stores/candidates';
	import { cursor } from '@sudoku/stores/cursor';
	import { hints } from '@sudoku/stores/hints';
	import { notes } from '@sudoku/stores/notes';
	import { settings } from '@sudoku/stores/settings';
	import { keyboardDisabled } from '@sudoku/stores/keyboard';
	import {
		canRedo,
		canUndo,
		candidateHintState,
		domainGame,
		exploreState,
		nextHintState,
		userGrid
	} from '@sudoku/stores/grid';
	import { gamePaused } from '@sudoku/stores/game';

	// 响应式声明：用于 UI 是否可用 / 显示文本的计算
	// 是否还有 hint 可用（提示次数）
	$: hintsAvailable = $hints > 0;

	// 当前选中格子是否为空（用于决定是否可以请求候选提示）
	$: selectedCellEmpty = $cursor.x !== null && $cursor.y !== null && $userGrid[$cursor.y]?.[$cursor.x] === 0;

	// 是否允许请求单格候选（非暂停且选中且为空）
	$: canAskCellHint = !$gamePaused && selectedCellEmpty;

	// 将领域层返回的候选提示格式化成简短的文本，用于状态面板展示
	$: candidateHintText = $candidateHintState
		? `R${$candidateHintState.row + 1}C${$candidateHintState.col + 1} 候选：${$candidateHintState.candidates.join(', ')}`
		: '';

	// 将下一步提示格式化成简短文本
	$: nextHintText = $nextHintState
		? `下一步：R${$nextHintState.row + 1}C${$nextHintState.col + 1} 只能填 ${$nextHintState.value}`
		: '';

	// 根据 Explore 状态生成展示文本（包含冲突 / 已知失败提示 / 深度信息）
	$: exploreText = !$exploreState.active
		? '未进入 Explore Mode'
		: $exploreState.hasConflict
			? '当前探索分支已经冲突，请回滚、放弃或改走别的分支'
			: $exploreState.isKnownFailure
				? '当前局面命中过去失败过的探索路径，建议尽早回退'
				: `Explore 深度：${$exploreState.currentDepth}，已记住 ${$exploreState.failedPathCount} 条失败路径`;

	// 以下为各个按钮的事件处理函数，均调用领域层的命令

	// 撤销一次操作
	function handleUndo() {
		game.undo();
	}

	// 重做一次操作
	function handleRedo() {
		game.redo();
	}

	// 使用直接填答案式提示（消耗 hint）
	function handleFillHint() {
		// 只有当有提示次数并且格子为空时才执行
		if (!hintsAvailable || !selectedCellEmpty) {
			return;
		}

		// 如果该格当前存在候选标记（笔记式的候选），先清除它
		if ($candidates.hasOwnProperty($cursor.x + ',' + $cursor.y)) {
			candidates.clear($cursor);
		}

		// 调用 store 的 applyHint，领域层会执行实际填数并更新历史
		userGrid.applyHint($cursor);
	}

	// 请求显示当前选中格子的候选提示（不修改盘面，只给 UI 展示）
	function handleCandidateHint() {
		if (!canAskCellHint) {
			return;
		}

		domainGame.showCellHint($cursor);
	}

	// 请求显示“下一步”推定提示，若返回位置则移动光标到该格
	function handleNextHint() {
		const hint = domainGame.showNextHint();
		if (hint) {
			cursor.set(hint.col, hint.row);
		}
	}

	// Explore 模式控制命令：开始、回到起点、提交、放弃
	function handleStartExplore() {
		domainGame.startExplore();
	}

	function handleResetExplore() {
		domainGame.resetExplore();
	}

	function handleCommitExplore() {
		domainGame.commitExplore();
	}

	function handleDiscardExplore() {
		domainGame.discardExplore();
	}
</script>

<div class="action-panel space-y-3">
	<div class="action-buttons space-x-3">
		<button class="btn btn-round" disabled={$gamePaused || !$canUndo} title="Undo" on:click={handleUndo}>
			<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
			</svg>
		</button>

		<button class="btn btn-round" disabled={$gamePaused || !$canRedo} title="Redo" on:click={handleRedo}>
			<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 90 00-8 8v2M21 10l-6 6m6-6l-6-6" />
			</svg>
		</button>

		<button class="btn btn-round btn-badge" disabled={$keyboardDisabled || !hintsAvailable || !selectedCellEmpty} on:click={handleFillHint} title="Direct Hint ({$hints})">
			<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
			</svg>

			{#if $settings.hintsLimited}
				<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
			{/if}
		</button>

		<button class="btn btn-round" disabled={!canAskCellHint} title="Candidate Hint" on:click={handleCandidateHint}>
			<span class="text-sm font-semibold">候选</span>
		</button>

		<button class="btn btn-round" disabled={$gamePaused} title="Next Hint" on:click={handleNextHint}>
			<span class="text-sm font-semibold">下一步</span>
		</button>

		<button class="btn btn-round btn-badge" on:click={notes.toggle} title="Notes ({$notes ? 'ON' : 'OFF'})">
			<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
			</svg>

			<span class="badge tracking-tighter" class:badge-primary={$notes}>{$notes ? 'ON' : 'OFF'}</span>
		</button>
	</div>

	<div class="explore-buttons space-x-3">
		{#if !$exploreState.active}
			<button class="btn btn-small" disabled={$gamePaused} on:click={handleStartExplore}>进入 Explore</button>
		{:else}
			<button class="btn btn-small" on:click={handleResetExplore}>回到探索起点</button>
			<button class="btn btn-small btn-primary" disabled={!$exploreState.canCommit} on:click={handleCommitExplore}>提交探索结果</button>
			<button class="btn btn-small" on:click={handleDiscardExplore}>放弃探索</button>
		{/if}
	</div>

	{#if candidateHintText || nextHintText || $exploreState.active}
		<div class="status-panel">
			{#if candidateHintText}
				<p>{candidateHintText}</p>
			{/if}

			{#if nextHintText}
				<p>{nextHintText}</p>
			{/if}

			{#if $exploreState.active}
				<p class:status-warning={$exploreState.hasConflict || $exploreState.isKnownFailure}>{exploreText}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.action-panel {
		@apply flex flex-col;
	}

	.action-buttons {
		@apply flex flex-wrap justify-evenly self-end;
	}

	.explore-buttons {
		@apply flex flex-wrap;
	}

	.btn-badge {
		@apply relative;
	}

	.badge {
		min-height: 20px;
		min-width: 20px;
		@apply p-1 rounded-full leading-none text-center text-xs text-white bg-gray-600 inline-block absolute top-0 left-0;
	}

	.badge-primary {
		@apply bg-primary;
	}

	.status-panel {
		@apply rounded-xl bg-white bg-opacity-75 p-3 text-sm text-gray-700;
	}

	.status-panel > p + p {
		margin-top: 0.25rem;
	}

	.status-warning {
		@apply text-red-700 font-semibold;
	}
</style>
