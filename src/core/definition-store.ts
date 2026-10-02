export class DefinitionStore<T> {
  private readonly byName = new Map<string, T>();

  put(name: string, value: T): boolean {
    const replaced = this.byName.has(name);
    this.byName.set(name, value);
    return replaced;
  }

  remove(name: string): boolean {
    return this.byName.delete(name);
  }

  contains(name: string): boolean {
    return this.byName.has(name);
  }

  find(name: string): T | undefined {
    return this.byName.get(name);
  }

  values(): T[] {
    return Array.from(this.byName.values());
  }

  get size(): number {
    return this.byName.size;
  }

  reset(): boolean {
    if (this.byName.size === 0) return false;
    this.byName.clear();
    return true;
  }
}
