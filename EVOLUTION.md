# EVOLUTION

## 1. 你如何实现提示功能？

本次作业中，我把提示功能实现为领域对象提供的查询能力，而不是在 UI 组件里临时拼接。当前代码中主要有三类提示接口：

- `Sudoku.getCandidates(row, col)`：计算某个空格在当前盘面下可以填写的候选数集合。
- `Sudoku.getCellHint(row, col)`：把某个格子的候选数整理成统一的提示对象，返回 `row`、`col`、`candidates`、`value` 和 `reason`。
- `Sudoku.getNextHint()`：扫描整个棋盘，寻找候选数只有一个的格子，作为“下一步可以推定填写”的提示。

其中，候选提示对应作业要求中的“提示用户当前棋盘，某个格子的候选数集合”；下一步提示对应“提示用户当前棋盘，下一步可以填写的候选数（推定数）”。如果某个格子只有一个候选值，`getCellHint()` 会把这个值放在 `value` 中，并把原因标记为 `single-candidate`；如果有多个候选值，则 `value` 为 `null`，原因标记为 `candidate-list`。

`Game` 并不重新实现数独规则，而是通过 `getCellHint(cell)` 和 `getNextHint()` 把请求转交给当前活跃的 `Sudoku` 对象。这样普通模式下提示作用于主局面，Explore Mode 下提示作用于探索局面，UI 不需要知道当前到底是哪一个对象在被操作。

在界面适配层中，`src/node_modules/@sudoku/stores/grid.js` 提供了 `showCellHint(pos)` 和 `showNextHint()`。它们负责调用 `Game` 的提示接口，并把返回结果发布为 `candidateHint` 和 `nextHint` 状态。棋盘组件只负责显示这些结果，例如展示候选数、高亮下一步提示格子，而不负责计算候选数本身。

当前代码还保留了原有的“直接填答案式提示”：`Sudoku.applyHint(move)` 会基于题面求出的标准解填写指定格子，`Game.applyHint(move)` 再把这次修改纳入当前会话的 history。这和候选提示、下一步提示不同，它不是只读查询，而是会改变盘面的操作。

## 2. 你认为提示功能更属于 `Sudoku` 还是 `Game`？为什么？

我认为提示功能需要由 `Sudoku` 和 `Game` 协作完成，但核心规则计算更属于 `Sudoku`。

原因是，候选数判断和单候选推定本质上是数独规则问题：一个数字能不能放入某个格子，取决于当前行、列、九宫格中是否已经出现相同数字。因此，`getCandidates()`、`getCellHint()`、`getNextHint()` 这些只依赖盘面规则的逻辑应该放在 `Sudoku` 中。这样可以保持 `Sudoku` 作为核心领域对象的职责完整，也避免 UI 层重复实现规则。

但是，Homework 2 引入 Explore Mode 之后，程序中不再只有一个盘面。玩家可能处于主局面，也可能处于探索局面。此时“应该对哪一个盘面给出提示”不是纯数独规则问题，而是游戏会话状态问题，所以这部分职责应该由 `Game` 负责。

因此当前设计是：

- `Sudoku` 负责“如何根据盘面计算提示”。
- `Game` 负责“当前应该对主局面还是探索局面计算提示”。
- store 和 UI 负责“如何触发提示并把提示展示给用户”。

这种划分符合题目要求：提示能力通过领域对象接口提供，而不是只在 UI 组件中临时拼接。

## 3. 你如何实现探索模式？

我把 Explore Mode 实现为 `Game` 内部的一条临时子会话。`Game` 原本持有主局面 `#sudoku`、主撤销栈 `#undoStack` 和主重做栈 `#redoStack`；Homework 2 中新增了 `#exploration` 字段，用来表示当前是否处于探索模式。

进入探索模式时，`Game.startExplore()` 会创建一个探索会话对象，里面保存：

- `baseSnapshot`：进入探索时主局面的快照，也是回到探索起点的依据。
- `sudoku`：从主局面克隆出来的探索局面。
- `undoStack`：探索过程自己的撤销栈。
- `redoStack`：探索过程自己的重做栈。

之后，`Game._getActiveSudoku()` 会根据当前状态返回活跃局面：如果没有进入 Explore，就返回主局面；如果已经进入 Explore，就返回探索局面。`guess()`、`applyHint()`、`getCellHint()`、`getNextHint()`、`undo()`、`redo()` 都基于这个“当前活跃局面”工作。

探索模式满足作业中要求的三个能力：

- 冲突：探索中每次修改后，`Game` 可以通过探索局面的 `getConflicts()` 判断是否出现冲突；`getExploreState()` 会返回 `hasConflict` 和 `canCommit`。
- 回溯：`resetExplore()` 会把探索局面恢复到 `baseSnapshot`，快速回到进入探索时的起点；探索中的 `undo()` 和 `redo()` 也使用探索会话自己的历史栈。
- 记忆：当探索局面已经产生冲突时，`_rememberFailedExplorationPath()` 会把当前冲突局面的 grid key 记录到 `#failedExplorationKeys`。之后如果再次走到同一个失败局面，`getExploreState()` 会通过 `isKnownFailure` 告知 UI 这是已知失败局面。

这里需要特别说明：当前代码只记录“已经确认冲突的最终局面”，不会把通往冲突的所有中间局面都标记为失败。这样做是为了避免误判，因为同一个中间局面以后可能通过选择不同候选值走向成功。

## 4. 主局面与探索局面的关系是什么？

主局面和探索局面不是共享同一个 `Sudoku` 实例，而是复制关系。

进入 Explore Mode 时，`startExplore()` 使用当前主局面的快照和克隆对象创建探索会话。探索局面的修改只发生在 `#exploration.sudoku` 上，不会直接修改 `#sudoku`。这可以避免探索过程污染主局面，也避免主 history 和探索 history 混在一起。

放弃探索时，`discardExplore()` 直接把 `#exploration` 设为 `null`。因为探索局面本来就是从主局面复制出来的，所以丢弃探索对象就等于回到主局面，不需要额外恢复主局面。

重置探索时，`resetExplore()` 使用 `baseSnapshot` 重新创建探索局面，并清空探索过程中的 undo/redo 栈。这对应作业要求中的“快速回到探索的起点，选择另外的候选值”。

提交探索时，`commitExplore()` 会先检查探索局面是否存在冲突。如果有冲突，提交失败，探索模式保持激活，用户可以继续修复。如果没有冲突，则比较主局面快照和探索局面快照：如果确实发生了变化，就把提交前的主局面快照压入主 undo 栈，并把探索结果转换成新的主局面。

为了避免深拷贝问题，代码中大量使用 `createSnapshot()`、`fromSnapshot()`、`clone()` 和 `cloneGrid()`。这样每次在主局面、探索局面、history 之间传递状态时，传递的都是独立快照，而不是可被多个对象同时修改的数组引用。

## 5. 你的 history 结构在本次作业中是否发生了变化？

发生了变化，但没有演变成复杂的树状 DAG。

Homework 1 中，history 主要服务于主局面的线性 Undo/Redo。Homework 2 中，为了支持 Explore Mode，我在主 history 之外增加了探索会话自己的 history：

- 主局面仍然有 `#undoStack` 和 `#redoStack`。
- 探索局面有 `#exploration.undoStack` 和 `#exploration.redoStack`。
- 普通模式下的 `guess()`、`applyHint()`、`undo()`、`redo()` 操作主 history。
- Explore Mode 下的 `guess()`、`applyHint()`、`undo()`、`redo()` 操作探索 history。

提交 Explore 时，探索过程中的每一步不会逐条进入主 history。当前设计把整次探索的最终结果看作一次主局面提交：提交前的主局面快照会进入主 undo 栈，提交后的探索结果成为新的主局面。这样主流程仍然保持线性、清晰，也避免把临时尝试过程暴露成主局面的多次正式操作。

因此，当前 history 结构可以理解为“主线性 history + 一个临时探索线性 history”。它没有引入真正的树状分支或 DAG 合并语义，因为本次作业明确不要求多层嵌套探索和复杂分支合并。

另外，当前序列化也跟随 history 结构发生了演进。`Game.toJSON()` 会保存主局面、主 undo/redo、当前探索会话以及 `failedExplorationKeys`。对应的反序列化逻辑会恢复这些状态，使外表化能力没有因为 Homework 2 的新增状态而失效。

## 6. Homework 1 中的哪些设计，在 Homework 2 中暴露出了局限？

Homework 1 的设计可以完成基础数独、Undo/Redo 和序列化，但在 Homework 2 中暴露出几个局限。

第一，`Sudoku` 原本更偏向“保存盘面和执行填数”，缺少对盘面的只读分析能力。Hint 功能要求程序能回答“这个格子有哪些候选数”“下一步能推定哪个格子”，所以 `Sudoku` 需要增加 `getCandidates()`、`getCellHint()` 和 `getNextHint()` 这类规则查询接口。

第二，`Game` 原本默认只有一个当前局面。Explore Mode 出现后，程序必须区分主局面和探索局面，否则无法保证探索修改不会污染主局面，也无法正确处理提交、放弃和回滚。

第三，原来的 history 只适合主流程的一条线性输入历史。探索模式需要一段临时历史，如果直接把探索中的每一步都塞进主 history，会导致主流程和临时尝试混在一起，撤销/重做语义变得不清楚。

第四，序列化原本只需要保存主局面和主 history。Homework 2 中新增了探索会话和失败局面记忆，如果不扩展外表化结构，刷新或恢复游戏时就会丢失 Explore Mode 的状态。

第五，UI 适配层原本主要发布棋盘、冲突、胜利状态和 undo/redo 状态。Hint 与 Explore Mode 增加后，store 还需要统一发布候选提示、下一步提示、探索状态、已知失败提醒等信息。否则组件之间会各自维护临时状态，导致业务逻辑重新散落到 UI 层。

## 7. 如果重做一次 Homework 1，你会如何修改原设计？

如果重做 Homework 1，我会在不提前实现 HW2 功能的前提下，提前为对象演进留出更清晰的接口。

首先，我会从一开始就更明确地区分 `Sudoku` 和 `Game` 的职责：`Sudoku` 只负责盘面、题面、规则校验和规则查询；`Game` 负责当前会话、history、状态切换和外表化。这样到 Homework 2 增加提示和探索时，不需要重新思考“规则该放哪里、状态该放哪里”。

其次，我会把快照能力作为正式接口设计，而不是只把它看成 Undo/Redo 的内部实现细节。当前 Explore Mode 的进入、重置、提交、放弃、序列化都依赖快照。如果 Homework 1 一开始就把 `createSnapshot()` 和 `fromSnapshot()` 设计清楚，Homework 2 的演进会更自然。

第三，我会提前预留只读规则查询接口的方向。即使 Homework 1 不实现提示，也可以在设计上认识到 `Sudoku` 不只会“修改盘面”，还应该能“分析盘面”。这样之后加入候选提示和下一步提示时，就不会把逻辑写进 UI。

第四，我会让 history 从一开始就保存结构化快照，而不是只保存原始 grid。结构化快照可以同时保留 `grid` 和 `givens`，对固定题面、可编辑状态、序列化恢复都更安全。

最后，我会让 UI store 更早承担“领域对象到界面状态”的适配职责。组件只负责交互和展示，真正的规则、会话状态和历史状态都从领域对象或统一 store 中获得。这样后续加入 Hint、Explore Mode 或更多状态时，整体结构不会明显退化成临时拼接。

## 8. 本次新增了哪些 Homework 2 测试？

我新增了 `tests/hw2/01-hint-explore.test.js`，专门覆盖 Homework 2 的 Hint 和 Explore Mode 行为。新增测试不修改 Homework 1 原有测试，而是在新的 `tests/hw2` 目录中验证新增能力。

测试主要覆盖以下内容：

- 候选提示：直接验证 `Sudoku.getCandidates()` 和 `Sudoku.getCellHint()` 能从领域对象返回某个格子的候选数集合。
- 下一步提示：验证 `Game.getNextHint()` 能通过当前活跃局面返回单候选推定提示。
- 探索隔离：验证 Explore Mode 中的试填不会直接污染主局面，`discardExplore()` 后主局面保持原状。
- 探索回溯：验证 `resetExplore()` 可以回到进入探索时的起点，并清空探索分支自己的历史。
- 探索内 Undo/Redo：验证 Explore Mode 拥有独立的撤销和重做栈，不会和主局面 history 混在一起。
- 冲突与失败记忆：验证冲突探索局面不能提交，并且 `getExploreState()` 会标记当前局面为已知失败。
- 探索提交：验证没有冲突的探索结果可以提交回主局面，并作为主 history 中的一次正式提交。
- 序列化恢复：验证正在进行的 Explore 会话可以通过 `Game.toJSON()` 和 `createGameFromJSON()` 保存并恢复。

这些测试也帮助发现并修复了一个实际问题：`Game.toJSON()` 会把探索中的 `Sudoku` 保存成纯数据对象，但恢复时原逻辑只接受带 `getGrid()` 方法的对象，导致活跃探索会话无法反序列化。修复后，`Game` 可以兼容 `{ grid, givens }` 这种纯数据结构，保证 Explore Mode 的外表化能力完整。
