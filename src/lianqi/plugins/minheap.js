// 基于最小堆的优先队列实现
class MinHeap {
  constructor() {
    // 初始化堆为空数组
    this.heap = []
  }
  // 向堆中添加一个新节点
  add(node, priority) {
    // 将新节点和优先级添加到堆的末尾
    this.heap.push({ node, priority })
    // 将新节点上浮到正确的位置以维护堆的性质
    this.bubbleUp(this.heap.length - 1)
  }
  // 上浮操作，将节点移动到正确的位置以维护堆的性质
  bubbleUp(index) {
    // 当前节点的父节点索引
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      // 如果父节点的优先级小于等于当前节点的优先级，则堆的性质已经满足
      if (this.heap[parentIndex].priority <= this.heap[index].priority)
        break
        // 交换当前节点与父节点的位置
      ;[this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]]
      // 更新当前节点的索引为其父节点的索引
      index = parentIndex
    }
  }
  // 移除并返回堆中的最小节点（即优先级最高的节点）
  poll() {
    // 堆顶的最小节点
    const min = this.heap[0]
    // 从堆中移除最后一个节点并保存
    const end = this.heap.pop()
    // 如果堆中还有其他节点，则将最后一个节点移动到堆顶并进行下沉操作
    if (this.heap.length > 0) {
      this.heap[0] = end
      this.bubbleDown(0)
    }
    // 返回最小节点
    return min.node
  }
  // 下沉操作，将节点移动到正确的位置以维护堆的性质
  bubbleDown(index) {
    const length = this.heap.length
    const element = this.heap[index]
    while (true) {
      // 当前节点的左子节点和右子节点的索引
      let leftChildIndex = 2 * index + 1
      let rightChildIndex = 2 * index + 2
      let swapIndex = null
      // 如果左子节点存在且其优先级小于当前节点的优先级，则选择左子节点进行交换
      if (leftChildIndex < length) {
        if (this.heap[leftChildIndex].priority < element.priority) {
          swapIndex = leftChildIndex
        }
      }
      // 如果右子节点存在且其优先级小于当前节点或左子节点的优先级，则选择右子节点进行交换
      if (rightChildIndex < length) {
        if (
          (swapIndex === null && this.heap[rightChildIndex].priority < element.priority) ||
          (swapIndex !== null && this.heap[rightChildIndex].priority < this.heap[leftChildIndex].priority)
        )
          swapIndex = rightChildIndex
      }
      // 如果没有需要交换的子节点，退出循环
      if (swapIndex === null) break
      // 交换当前节点与选择的子节点的位置
      ;[this.heap[index], this.heap[swapIndex]] = [this.heap[swapIndex], this.heap[index]]
      // 更新当前节点的索引为交换后子节点的索引
      index = swapIndex
    }
  }
  // 检查堆是否为空
  isEmpty() {
    return this.heap.length === 0
  }
}

export default MinHeap
