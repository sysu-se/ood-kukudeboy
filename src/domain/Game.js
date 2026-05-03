import { Sudoku } from './Sudoku.js'
import { areGridsEqual, cloneGrid } from './utils.js'

/**
 * 将输入统一转换成可被 Game 安全持有的 Sudoku 实例。
 * @param {Sudoku | { getGrid: Function, getGivens?: Function }} sudoku
 * @returns {Sudoku}
 */
function coerceSudoku(sudoku) {
	if (sudoku instanceof Sudoku) {
		return sudoku.clone()
	}

	if (sudoku && typeof sudoku === 'object' && Array.isArray(sudoku.grid)) {
		// 反序列化 Explore 会话时，探索局面来自 Sudoku.toJSON() 的纯数据对象；
		// 这里兼容该格式，避免恢复 Game 时丢失正在进行的探索分支。
		return new Sudoku({
			grid: sudoku.grid,
			givens: sudoku.givens ?? sudoku.grid,
		})
	}

	if (!sudoku || typeof sudoku.getGrid !== 'function') {
		throw new Error('Game requires a Sudoku-like object')
	}

	return new Sudoku({
		grid: sudoku.getGrid(),
		givens: typeof sudoku.getGivens === 'function' ? sudoku.getGivens() : sudoku.getGrid(),
	})
}

/**
 * 统一规范 Game 历史栈中的快照结构。
 * 兼容旧版只存 raw grid 的历史格式，同时把恢复细节封装回 Sudoku 自身。
 * @param {number[][] | { grid: number[][], givens?: number[][] }} snapshot
 * @param {number[][]} fallbackGivens
 * @returns {{ grid: number[][], givens: number[][] }}
 */
function normalizeSnapshot(snapshot, fallbackGivens) {
	if (Array.isArray(snapshot)) {
		return {
			grid: cloneGrid(snapshot),
			givens: cloneGrid(fallbackGivens),
		}
	}

	if (!snapshot || typeof snapshot !== 'object') {
		throw new Error('Game snapshot must be a grid or snapshot object')
	}

	return {
		grid: cloneGrid(snapshot.grid),
		givens: cloneGrid(snapshot.givens ?? fallbackGivens),
	}
}

/**
 * 规范化 Explore 会话结构。
 * Homework 2 只要求最小可用 Explore Mode，因此这里显式维持一条独立分支会话。
 * @param {Object | null | undefined} exploration
 * @param {Sudoku} fallbackSudoku
 * @returns {null | {
 *   baseSnapshot: { grid: number[][], givens: number[][] },
 *   sudoku: Sudoku,
 *   undoStack: { grid: number[][], givens: number[][] }[],
 *   redoStack: { grid: number[][], givens: number[][] }[],
 * }}
 */
function normalizeExploration(exploration, fallbackSudoku) {
	if (!exploration || typeof exploration !== 'object') {
		return null
	}

	const fallbackSnapshot = fallbackSudoku.createSnapshot()
	const baseSnapshot = normalizeSnapshot(
		exploration.baseSnapshot ?? fallbackSnapshot,
		fallbackSnapshot.givens,
	)
	const baseSudoku = Sudoku.fromSnapshot(baseSnapshot)

	return {
		baseSnapshot,
		sudoku: exploration.sudoku
			? coerceSudoku(exploration.sudoku)
			: baseSudoku.clone(),
		undoStack: Array.isArray(exploration.undoStack)
			? exploration.undoStack.map(snapshot => normalizeSnapshot(snapshot, baseSnapshot.givens))
			: [],
		redoStack: Array.isArray(exploration.redoStack)
			? exploration.redoStack.map(snapshot => normalizeSnapshot(snapshot, baseSnapshot.givens))
			: [],
	}
}

/**
 * 为探索失败记忆生成稳定 key。
 * 这里只看当前 grid，因为失败记忆描述的是某个探索局面本身。
 * @param {number[][]} grid
 * @returns {string}
 */
function createGridKey(grid) {
	return grid.map(row => row.join('')).join('|')
}

/**
 * 深拷贝快照，避免主局面与探索局面之间产生引用污染。
 * @param {{ grid: number[][], givens: number[][] }} snapshot
 * @returns {{ grid: number[][], givens: number[][] }}
 */
function cloneSnapshot(snapshot) {
	return {
		grid: cloneGrid(snapshot.grid),
		givens: cloneGrid(snapshot.givens),
	}
}

/**
 * 游戏领域对象，负责管理当前数独对象、主 history，以及 Homework 2 的 Explore 会话。
 */
export class Game {
	/** @type {Sudoku} 主局面持有的数独对象 */
	#sudoku
	/** @type {{ grid: number[][], givens: number[][] }[]} 主局面的撤销历史 */
	#undoStack
	/** @type {{ grid: number[][], givens: number[][] }[]} 主局面的重做历史 */
	#redoStack
	/** @type {null | { baseSnapshot: { grid: number[][], givens: number[][] }, sudoku: Sudoku, undoStack: { grid: number[][], givens: number[][] }[], redoStack: { grid: number[][], givens: number[][] }[] }} */
	#exploration
	/** @type {Set<string>} 已经确认冲突失败的探索终点局面 */
	#failedExplorationKeys

	/**
	 * 创建一个 Game 实例。
	 * @param {Object} params
	 * @param {Sudoku} params.sudoku
	 * @param {(number[][] | { grid: number[][], givens?: number[][] })[]} [params.undoStack=[]]
	 * @param {(number[][] | { grid: number[][], givens?: number[][] })[]} [params.redoStack=[]]
	 * @param {Object | null} [params.exploration=null]
	 * @param {string[]} [params.failedExplorationKeys=[]]
	 */
	constructor({ sudoku, undoStack = [], redoStack = [], exploration = null, failedExplorationKeys = [] }) {
		this.#sudoku = coerceSudoku(sudoku)
		const fallbackGivens = this.#sudoku.getGivens()
		this.#undoStack = undoStack.map(snapshot => normalizeSnapshot(snapshot, fallbackGivens))
		this.#redoStack = redoStack.map(snapshot => normalizeSnapshot(snapshot, fallbackGivens))
		this.#exploration = normalizeExploration(exploration, this.#sudoku)
		this.#failedExplorationKeys = new Set(
			Array.isArray(failedExplorationKeys)
				? failedExplorationKeys.filter(key => typeof key === 'string')
				: [],
		)
	}

	/**
	 * 返回当前活跃的局面。
	 * 进入 Explore 后，UI 和提示能力都应该工作在探索分支上。
	 * @returns {Sudoku}
	 */
	_getActiveSudoku() {
		return this.#exploration ? this.#exploration.sudoku : this.#sudoku
	}

	/**
	 * 获取当前数独对象的克隆副本。
	 * @returns {Sudoku}
	 */
	getSudoku() {
		return this._getActiveSudoku().clone()
	}

	/**
	 * 判断当前是否处于 Explore Mode。
	 * @returns {boolean}
	 */
	isExploring() {
		return this.#exploration !== null
	}

	/**
	 * 返回当前活跃局面的候选提示。
	 * @param {{ row: number, col: number }} cell
	 * @returns {{ row: number, col: number, candidates: number[], value: number | null, reason: string } | null}
	 */
	getCellHint(cell) {
		return this._getActiveSudoku().getCellHint(cell.row, cell.col)
	}

	/**
	 * 返回当前活跃局面的下一步推定提示。
	 * @returns {{ row: number, col: number, candidates: number[], value: number, reason: string } | null}
	 */
	getNextHint() {
		return this._getActiveSudoku().getNextHint()
	}

	/**
	 * 统一处理一次会改变盘面的操作。
	 * 这样主局面与 Explore 分支可以共用同一套历史写入逻辑。
	 * @param {(sudoku: Sudoku) => boolean} updater
	 * @returns {boolean}
	 */
	_applyMutation(updater) {
		const activeSudoku = this._getActiveSudoku()
		const previousSnapshot = activeSudoku.createSnapshot()
		const workingCopy = activeSudoku.clone()
		const changed = updater(workingCopy)
		if (!changed) {
			return false
		}

		if (this.#exploration) {
			this.#exploration.undoStack.push(previousSnapshot)
			this.#exploration.redoStack = []
			this.#exploration.sudoku = workingCopy
			this._rememberFailedExplorationPath()
			return true
		}

		this.#undoStack.push(previousSnapshot)
		this.#redoStack = []
		this.#sudoku = workingCopy
		return true
	}

	/**
	 * 执行一次填数操作，并在成功后写入当前会话的历史。
	 * @param {{ row: number, col: number, value: number }} move
	 * @returns {boolean}
	 */
	guess(move) {
		return this._applyMutation(sudoku => sudoku.guess(move))
	}

	/**
	 * 应用一次直接填答案式提示。
	 * @param {{ row: number, col: number }} move
	 * @returns {boolean}
	 */
	applyHint(move) {
		return this._applyMutation(sudoku => sudoku.applyHint(move))
	}

	/**
	 * 进入 Explore Mode。
	 * Explore 会话以当前主局面为起点，拥有独立的撤销/重做历史。
	 * @returns {boolean}
	 */
	startExplore() {
		if (this.#exploration) {
			return false
		}

		this.#exploration = {
			baseSnapshot: this.#sudoku.createSnapshot(),
			sudoku: this.#sudoku.clone(),
			undoStack: [],
			redoStack: [],
		}

		return true
	}

	/**
	 * 将探索局面快速回滚到进入 Explore 时的起点。
	 * @returns {boolean}
	 */
	resetExplore() {
		if (!this.#exploration) {
			return false
		}

		this.#exploration.sudoku = Sudoku.fromSnapshot(this.#exploration.baseSnapshot)
		this.#exploration.undoStack = []
		this.#exploration.redoStack = []
		return true
	}

	/**
	 * 放弃当前探索结果，回到主局面。
	 * @returns {boolean}
	 */
	discardExplore() {
		if (!this.#exploration) {
			return false
		}

		this.#exploration = null
		return true
	}

	/**
	 * 将探索结果合并回主局面。
	 * 这里把整个 Explore 会话视作主 history 中的一次提交。
	 * @returns {boolean}
	 */
	commitExplore() {
		if (!this.#exploration) {
			return false
		}

		const activeSudoku = this.#exploration.sudoku
		if (activeSudoku.getConflicts().length > 0) {
			return false
		}

		const previousMainSnapshot = this.#sudoku.createSnapshot()
		const nextMainSnapshot = activeSudoku.createSnapshot()
		const changed = !areGridsEqual(previousMainSnapshot.grid, nextMainSnapshot.grid)

		this.#exploration = null
		if (!changed) {
			return false
		}

		this.#undoStack.push(previousMainSnapshot)
		this.#redoStack = []
		this.#sudoku = Sudoku.fromSnapshot(nextMainSnapshot)
		return true
	}

	/**
	 * 如果当前探索局面已经出现冲突，只记录最终冲突局面的 key。
	 * 中间局面可能仍然能通过其他候选值走向成功，不能被直接标记为失败。
	 */
	_rememberFailedExplorationPath() {
		if (!this.#exploration) {
			return
		}

		if (this.#exploration.sudoku.getConflicts().length === 0) {
			return
		}

		this.#failedExplorationKeys.add(createGridKey(this.#exploration.sudoku.getGrid()))
	}

	/**
	 * 返回 Explore Mode 的状态说明，供 store/UI 渲染。
	 * @returns {{
	 *   active: boolean,
	 *   hasConflict: boolean,
	 *   isKnownFailure: boolean,
	 *   canCommit: boolean,
	 *   canReset: boolean,
	 *   canDiscard: boolean,
	 *   currentDepth: number,
	 *   failedPathCount: number,
	 * }}
	 */
	getExploreState() {
		if (!this.#exploration) {
			return {
				active: false,
				hasConflict: false,
				isKnownFailure: false,
				canCommit: false,
				canReset: false,
				canDiscard: false,
				currentDepth: 0,
				failedPathCount: this.#failedExplorationKeys.size,
			}
		}

		const currentGrid = this.#exploration.sudoku.getGrid()
		const currentKey = createGridKey(currentGrid)
		const hasConflict = this.#exploration.sudoku.getConflicts().length > 0

		return {
			active: true,
			hasConflict,
			// 这里只提示当前局面本身曾经冲突失败过，不再误标中间局面。
			isKnownFailure: this.#failedExplorationKeys.has(currentKey),
			canCommit: !hasConflict,
			canReset: true,
			canDiscard: true,
			currentDepth: this.#exploration.undoStack.length,
			failedPathCount: this.#failedExplorationKeys.size,
		}
	}

	/**
	 * 撤销最近一次成功的输入。
	 */
	undo() {
		if (!this.canUndo()) {
			return
		}

		if (this.#exploration) {
			this.#exploration.redoStack.push(this.#exploration.sudoku.createSnapshot())
			const previousSnapshot = this.#exploration.undoStack.pop()
			this.#exploration.sudoku = Sudoku.fromSnapshot(previousSnapshot)
			return
		}

		this.#redoStack.push(this.#sudoku.createSnapshot())
		const previousSnapshot = this.#undoStack.pop()
		this.#sudoku = Sudoku.fromSnapshot(previousSnapshot)
	}

	/**
	 * 重做最近一次被撤销的输入。
	 */
	redo() {
		if (!this.canRedo()) {
			return
		}

		if (this.#exploration) {
			this.#exploration.undoStack.push(this.#exploration.sudoku.createSnapshot())
			const nextSnapshot = this.#exploration.redoStack.pop()
			this.#exploration.sudoku = Sudoku.fromSnapshot(nextSnapshot)
			this._rememberFailedExplorationPath()
			return
		}

		this.#undoStack.push(this.#sudoku.createSnapshot())
		const nextSnapshot = this.#redoStack.pop()
		this.#sudoku = Sudoku.fromSnapshot(nextSnapshot)
	}

	/**
	 * 判断当前是否可以执行撤销。
	 * Explore 模式下优先使用探索会话自己的 history。
	 * @returns {boolean}
	 */
	canUndo() {
		if (this.#exploration) {
			return this.#exploration.undoStack.length > 0
		}

		return this.#undoStack.length > 0
	}

	/**
	 * 判断当前是否可以执行重做。
	 * @returns {boolean}
	 */
	canRedo() {
		if (this.#exploration) {
			return this.#exploration.redoStack.length > 0
		}

		return this.#redoStack.length > 0
	}

	/**
	 * 将当前游戏对象序列化为 JSON 兼容结构。
	 * @returns {{ type: string, version: number, sudoku: Object, undoStack: { grid: number[][], givens: number[][] }[], redoStack: { grid: number[][], givens: number[][] }[], exploration: Object | null, failedExplorationKeys: string[] }}
	 */
	toJSON() {
		return {
			type: 'Game',
			version: 4,
			sudoku: this.#sudoku.toJSON(),
			undoStack: this.#undoStack.map(cloneSnapshot),
			redoStack: this.#redoStack.map(cloneSnapshot),
			exploration: this.#exploration
				? {
					baseSnapshot: cloneSnapshot(this.#exploration.baseSnapshot),
					sudoku: this.#exploration.sudoku.toJSON(),
					undoStack: this.#exploration.undoStack.map(cloneSnapshot),
					redoStack: this.#exploration.redoStack.map(cloneSnapshot),
				}
				: null,
			failedExplorationKeys: [...this.#failedExplorationKeys],
		}
	}
}
