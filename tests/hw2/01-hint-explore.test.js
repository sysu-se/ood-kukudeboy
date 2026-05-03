import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js'

describe('HW2 hint domain behavior', () => {
  it('provides candidate hints from Sudoku instead of UI-only state', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())

    // HW2 要求候选提示来自领域对象；这里直接断言 Sudoku 能独立给出候选集合。
    expect(sudoku.getCandidates(0, 2)).toEqual([1, 2, 4])
    expect(sudoku.getCellHint(0, 2)).toEqual({
      row: 0,
      col: 2,
      candidates: [1, 2, 4],
      value: null,
      reason: 'candidate-list',
    })
  })

  it('finds the next single-candidate hint through Game active board delegation', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    // Game 不重复实现候选规则，只负责把请求转给当前活跃局面。
    expect(game.getNextHint()).toEqual({
      row: 4,
      col: 4,
      candidates: [5],
      value: 5,
      reason: 'single-candidate',
    })
  })
})

describe('HW2 explore mode behavior', () => {
  it('keeps exploration changes isolated until commit', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    expect(game.startExplore()).toBe(true)
    expect(game.guess({ row: 0, col: 2, value: 4 })).toBe(true)
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)

    // 放弃探索应丢弃临时分支，主局面不能被探索中的试填污染。
    expect(game.discardExplore()).toBe(true)
    expect(game.getSudoku().getGrid()[0][2]).toBe(0)
    expect(game.getExploreState().active).toBe(false)
  })

  it('resets exploration to its starting snapshot and clears branch history', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 0, col: 3, value: 6 })
    expect(game.getExploreState().currentDepth).toBe(2)

    // resetExplore 对应作业中的“快速回到探索起点”，并重新开始本轮探索历史。
    expect(game.resetExplore()).toBe(true)
    expect(game.getSudoku().getGrid()[0][2]).toBe(0)
    expect(game.getSudoku().getGrid()[0][3]).toBe(0)
    expect(game.getExploreState().currentDepth).toBe(0)
    expect(game.canUndo()).toBe(false)
  })

  it('uses independent undo and redo stacks inside exploration', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 0, col: 3, value: 6 })

    // Explore 内 undo/redo 只影响临时分支，不提前写入主 history。
    game.undo()
    expect(game.getSudoku().getGrid()[0][3]).toBe(0)
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)
    expect(game.canRedo()).toBe(true)

    game.redo()
    expect(game.getSudoku().getGrid()[0][3]).toBe(6)
  })

  it('blocks committing a conflicting exploration and remembers the failed board', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 3 })

    // 冲突局面不能提交，并且失败记忆只标记当前冲突终点局面。
    expect(game.getExploreState()).toMatchObject({
      active: true,
      hasConflict: true,
      isKnownFailure: true,
      canCommit: false,
    })
    expect(game.commitExplore()).toBe(false)
    expect(game.getExploreState().active).toBe(true)
    expect(game.getExploreState().failedPathCount).toBe(1)
  })

  it('commits a valid exploration as one main-history step', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 0, col: 3, value: 6 })

    // 提交时只把探索最终结果合并回主局面，主 history 视为一次正式提交。
    expect(game.commitExplore()).toBe(true)
    expect(game.getExploreState().active).toBe(false)
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)
    expect(game.getSudoku().getGrid()[0][3]).toBe(6)

    game.undo()
    expect(game.getSudoku().getGrid()[0][2]).toBe(0)
    expect(game.getSudoku().getGrid()[0][3]).toBe(0)
  })

  it('serializes and restores active exploration state', async () => {
    const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 0, col: 3, value: 6 })

    // 外表化需要覆盖新增的探索会话，否则刷新后会丢失 HW2 的临时分支状态。
    const restored = createGameFromJSON(game.toJSON())
    expect(restored.getExploreState()).toMatchObject({
      active: true,
      currentDepth: 2,
      canCommit: true,
    })
    expect(restored.getSudoku().getGrid()[0][2]).toBe(4)
    expect(restored.getSudoku().getGrid()[0][3]).toBe(6)
  })
})
