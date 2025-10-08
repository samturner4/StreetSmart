/**
 * Priority Queue implementation for A* optimization
 * Ported from web routing system
 */
export class PriorityQueue<T> {
  private heap: Array<{item: T, priority: number}> = [];
  
  enqueue(item: T, priority: number): void {
    this.heap.push({item, priority});
    this.bubbleUp(this.heap.length - 1);
  }
  
  dequeue(): T | undefined {
    if (this.isEmpty()) return undefined;
    
    const result = this.heap[0].item;
    const last = this.heap.pop()!;
    
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    
    return result;
  }
  
  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0].item : undefined;
  }
  
  isEmpty(): boolean {
    return this.heap.length === 0;
  }
  
  size(): number {
    return this.heap.length;
  }

  contains(item: T): boolean {
    return this.heap.some(node => node.item === item);
  }
  
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
      
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }
  
  private bubbleDown(index: number): void {
    while (true) {
      let smallest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      
      if (leftChild < this.heap.length && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      
      if (rightChild < this.heap.length && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }
      
      if (smallest === index) break;
      
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

