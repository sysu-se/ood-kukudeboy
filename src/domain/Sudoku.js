import { BOX_SIZE, GRID_SIZE, cloneConflicts, cloneGrid, normalizeMove, validateGrid } from './utils.js'

/**
 * 将构造输入统一整理成 { grid, givens } 的结构。
 * @param {number[][] | { grid: number[][], givens?: number[][] }} input
 * @returns {{ grid: number[][], givens: number[][] }}
 */
function normalizeSudokuInput(input) {
	if (Array.isArray(input)) {
		return {
			grid: input,
			givens: input,
		}
	}

	if (!input || typeof input !== 'object') {
		throw new Error('Sudoku input must be a grid or a configuration object')
	}

	const { grid, givens = grid } = input
	return { grid, givens }
}

/**
 * 校验题面 givens 与当前 grid 的核心不变量。
 * 题面中非 0 的位置代表固定真值，因此当前盘面必须与之保持一致。
 * @param {number[][]} grid
 * @param {number[][]} givens
 */
function validateGivensConsistency(grid, givens) {
	for (let row = 0; row < givens.length; row++) {
		for (let col = 0; col < givens[row].length; col++) {
			const givenValue = givens[row][col]
			if (givenValue !== 0 && grid[row][col] !== givenValue) {
				throw new Error('Sudoku grid must preserve non-zero givens')
			}
		}
	}
}

/**
 * 校验一个坐标是否在 9x9 数独盘面范围内。
 * 这里单独封装，是为了让提示相关接口也能复用统一的边界校验。
 * @param {number} row
 * @param {number} col
 * @returns {{ row: number, col: number }}
 */
function normalizeCellPosition(row, col) {
	return normalizeMove({ row, col, value: 0 })
}

/**
 * 判断某个数字放入指定位置后，是否仍满足基础数独规则。
 * @param {number[][]} grid
 * @param {number} row
 * @param {number} col
 * @param {number} value
 * @returns {boolean}
 */
function canPlaceValue(grid, row, col, value) {
	for (let index = 0; index < grid.length; index++) {
		if (grid[row][index] === value) {
			return false
		}

		if (grid[index][col] === value) {
			return false
		}
	}

	const startRow = Math.floor(row / BOX_SIZE) * BOX_SIZE
	const startCol = Math.floor(col / BOX_SIZE) * BOX_SIZE
	for (let r = startRow; r < startRow + BOX_SIZE; r++) {
		for (let c = startCol; c < startCol + BOX_SIZE; c++) {
			if (grid[r][c] === value) {
				return false
			}
		}
	}

	return true
}

/**
 * 使用回溯法求解给定数独网格。
 * 这个求解器只服务于题面真值和提示计算，不把复杂依赖再推回 UI 层。
 * @param {number[][]} grid
 * @returns {boolean}
 */
function solveGridInPlace(grid) {
	for (let row = 0; row < grid.length; row++) {
		for (let col = 0; col < grid[row].length; col++) {
			if (grid[row][col] !== 0) {
				continue
			}

			for (let value = 1; value <= grid.length; value++) {
				if (!canPlaceValue(grid, row, col, value)) {
					continue
				}

				grid[row][col] = value
				if (solveGridInPlace(grid)) {
					return true
				}
				grid[row][col] = 0
			}

			return false
		}
	}

	return true
}

/**
 * 基于题面求出标准解，并在无法求解时显式报错。
 * @param {number[][]} givens
 * @returns {number[][]}
 */
function solvePuzzle(givens) {
	const solution = cloneGrid(givens)
	if (!solveGridInPlace(solution)) {
		throw new Error('Sudoku givens must be solvable')
	}

	return solution
}

/**
 * 数独领域对象，负责管理盘面、题面以及基础数独规则。
 */
export class Sudoku {
	/** @type {number[][]} 当前正在被操作的数独盘面 */
	#grid
	/** @type {number[][]} 初始固定题面，用于判断格子是否可编辑 */
	#givens
	/** @type {number[][]} 基于题面求得的标准解，用于填答案式提示 */
	#solution

	/**
	 * 创建一个 Sudoku 实例。
	 * @param {number[][] | { grid: number[][], givens?: number[][] }} input
	 */
	constructor(input) {
		const { grid, givens } = normalizeSudokuInput(input)
		validateGrid(grid)
		validateGrid(givens, 'Sudoku givens')
		validateGivensConsistency(grid, givens)

		this.#grid = cloneGrid(grid)
		this.#givens = cloneGrid(givens)
		this.#solution = solvePuzzle(this.#givens)
	}

	/**
	 * 获取当前盘面的深拷贝副本。
	 * @returns {number[][]}
	 */
	getGrid() {
		return cloneGrid(this.#grid)
	}

	/**
	 * 获取固定题面的深拷贝副本。
	 * @returns {number[][]}
	 */
	getGivens() {
		return cloneGrid(this.#givens)
	}

	/**
	 * 判断指定格子是否允许修改。
	 * @param {number} row
	 * @param {number} col
	 * @returns {boolean}
	 */
	isEditableCell(row, col) {
		return this.#givens[row][col] === 0
	}

	/**
	 * 返回指定空格在当前盘面下的候选数集合。
	 * Homework 2 的“候选提示”是稳定的局面推理能力，因此保留在 Sudoku 中。
	 * @param {number} row
	 * @param {number} col
	 * @returns {number[]}
	 */
	getCandidates(row, col) {
		const normalized = normalizeCellPosition(row, col)
		if (!this.isEditableCell(normalized.row, normalized.col)) {
			return []
		}

		if (this.#grid[normalized.row][normalized.col] !== 0) {
			return []
		}

		const candidates = []
		for (let value = 1; value <= GRID_SIZE; value++) {
			if (canPlaceValue(this.#grid, normalized.row, normalized.col, value)) {
				candidates.push(value)
			}
		}

		return candidates
	}

	/**
	 * 返回指定格子的候选提示信息。
	 * @param {number} row
	 * @param {number} col
	 * @returns {{ row: number, col: number, candidates: number[], value: number | null, reason: string } | null}
	 */
	getCellHint(row, col) {
		const normalized = normalizeCellPosition(row, col)
		const candidates = this.getCandidates(normalized.row, normalized.col)
		if (candidates.length === 0) {
			return null
		}

		return {
			row: normalized.row,
			col: normalized.col,
			candidates,
			value: candidates.length === 1 ? candidates[0] : null,
			reason: candidates.length === 1 ? 'single-candidate' : 'candidate-list',
		}
	}

	/**
	 * 扫描当前盘面，寻找“只有一个候选值”的下一步推定提示。
	 * 这里不直接写入盘面，而是把推理结果作为提示信息返回给 Game/UI。
	 * @returns {{ row: number, col: number, candidates: number[], value: number, reason: string } | null}
	 */
	getNextHint() {
		for (let row = 0; row < GRID_SIZE; row++) {
			for (let col = 0; col < GRID_SIZE; col++) {
				const hint = this.getCellHint(row, col)
				if (hint && hint.value !== null) {
					return {
						row,
						col,
						candidates: hint.candidates,
						value: hint.value,
						reason: 'single-candidate',
					}
				}
			}
		}

		return null
	}

	/**
	 * 对指定位置执行一次填数或清空操作。
	 * 返回布尔值是为了让上层历史机制只记录真正改变盘面的输入。
	 * @param {{ row: number, col: number, value: number }} move
	 * @returns {boolean}
	 */
	guess(move) {
		const { row, col, value } = normalizeMove(move)
		if (!this.isEditableCell(row, col)) {
			throw new Error('Cannot change a given cell')
		}

		if (this.#grid[row][col] === value) {
			return false
		}

		this.#grid[row][col] = value
		return true
	}

	/**
	 * 根据题目的标准解为指定位置填入提示值。
	 * 这是比“下一步推定”更强的提示，仍然保留给 Game 作为直接代填能力。
	 * @param {{ row: number, col: number }} move
	 * @returns {boolean}
	 */
	applyHint(move) {
		const { row, col } = normalizeMove({ ...move, value: 0 })
		return this.guess({ row, col, value: this.#solution[row][col] })
	}

	/**
	 * 生成仅包含领域状态的快照，供 Game 的历史记录与恢复逻辑使用。
	 * @returns {{ grid: number[][], givens: number[][] }}
	 */
	createSnapshot() {
		return {
			grid: this.getGrid(),
			givens: this.getGivens(),
		}
	}

	/**
	 * 使用快照恢复一个 Sudoku。
	 * @param {{ grid: number[][], givens: number[][] }} snapshot
	 * @returns {Sudoku}
	 */
	static fromSnapshot(snapshot) {
		return new Sudoku(snapshot)
	}

	/**
	 * 克隆当前数独对象。
	 * @returns {Sudoku}
	 */
	clone() {
		return Sudoku.fromSnapshot(this.createSnapshot())
	}

	/**
	 * 计算当前盘面中的所有冲突格子。
	 * @returns {{ row: number, col: number }[]}
	 */
	getConflicts() {
		const conflicts = []
		const seen = new Set()

		const addConflict = (row, col) => {
			const key = `${row},${col}`
			if (!seen.has(key)) {
				seen.add(key)
				conflicts.push({ row, col })
			}
		}

		for (let row = 0; row < this.#grid.length; row++) {
			for (let col = 0; col < this.#grid[row].length; col++) {
				const value = this.#grid[row][col]
				if (value === 0) {
					continue
				}

				for (let index = 0; index < this.#grid.length; index++) {
					if (index !== col && this.#grid[row][index] === value) {
						addConflict(row, col)
						addConflict(row, index)
					}

					if (index !== row && this.#grid[index][col] === value) {
						addConflict(row, col)
						addConflict(index, col)
					}
				}

				const startRow = Math.floor(row / BOX_SIZE) * BOX_SIZE
				const startCol = Math.floor(col / BOX_SIZE) * BOX_SIZE
				for (let r = startRow; r < startRow + BOX_SIZE; r++) {
					for (let c = startCol; c < startCol + BOX_SIZE; c++) {
						if ((r !== row || c !== col) && this.#grid[r][c] === value) {
							addConflict(row, col)
							addConflict(r, c)
						}
					}
				}
			}
		}

		return cloneConflicts(conflicts)
	}

	/**
	 * 判断当前盘面是否满足基本数独规则。
	 * @returns {boolean}
	 */
	isValidBoard() {
		return this.getConflicts().length === 0
	}

	/**
	 * 判断当前盘面是否已经完成且合法。
	 * @returns {boolean}
	 */
	isSolved() {
		for (const row of this.#grid) {
			for (const cell of row) {
				if (cell === 0) {
					return false
				}
			}
		}

		return this.isValidBoard()
	}

	/**
	 * 将当前对象序列化为 JSON 兼容结构。
	 * @returns {{ type: string, version: number, grid: number[][], givens: number[][] }}
	 */
	toJSON() {
		return {
			type: 'Sudoku',
			version: 4,
			...this.createSnapshot(),
		}
	}

	/**
	 * 将当前盘面转换成便于调试的多行字符串。
	 * @returns {string}
	 */
	toString() {
		return this.#grid
			.map(row => row.map(cell => (cell === 0 ? '.' : String(cell))).join(' '))
			.join('\n')
	}
}
