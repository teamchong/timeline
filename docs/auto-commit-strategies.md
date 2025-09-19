# Auto-Commit Strategies Without User Interference

## The Problem
When multiple processes (IDE, hooks, user commands) access git simultaneously, they compete for `.git/index.lock`, causing conflicts and hangs.

## Strategy Comparison

### 1. Temporary Index (Current Implementation)
```bash
export GIT_INDEX_FILE=/tmp/timeline-index-$$
git read-tree HEAD
git add --all  # Still reads real index!
git write-tree
```
**Pros:** Simple, follows bash version
**Cons:** `git add` still needs to read real index for tracking info
**Lock Risk:** Medium - still accesses real index

### 2. Pure Object Creation (Recommended)
```bash
# Never touch index at all
git hash-object -w file.txt  # Create blob
git mktree < tree-entries    # Create tree  
git commit-tree $tree        # Create commit
git update-ref refs/...      # Update reference
```
**Pros:** Zero index access, no locks possible
**Cons:** More complex, need to walk directory manually
**Lock Risk:** None

### 3. Git Stash Create
```bash
git stash create  # Creates commit without touching index
```
**Pros:** Simple one-liner
**Cons:** Still reads working directory, can conflict
**Lock Risk:** Low

### 4. Queue/Daemon Approach
```typescript
// Single process handles all git operations
TimelineQueue.add(async () => {
  // Guaranteed sequential execution
});
```
**Pros:** Guaranteed no conflicts
**Cons:** Requires daemon, more complex
**Lock Risk:** None

### 5. Lock-Aware with Backoff
```bash
if [ -f .git/index.lock ]; then
  sleep $((RANDOM % 5))  # Random backoff
fi
```
**Pros:** Simple to implement
**Cons:** Can miss snapshots, not foolproof
**Lock Risk:** Low but not zero

### 6. Worktree Approach
```bash
git worktree add /tmp/timeline-work
cd /tmp/timeline-work
# Operations in isolated worktree
```
**Pros:** Complete isolation
**Cons:** Heavy, requires disk space
**Lock Risk:** None for main repo

## Recommended Solution: Hybrid Approach

1. **Primary**: Pure object creation (no index access)
2. **Fallback**: Skip if lock detected
3. **Queue**: For critical snapshots

```typescript
async function safeSnapshot() {
  // 1. Check for lock
  if (existsSync('.git/index.lock')) {
    // Skip this snapshot
    return;
  }
  
  // 2. Try pure object creation
  try {
    await createPureGitObjects();
  } catch (error) {
    // 3. Queue for retry if critical
    TimelineQueue.add(() => createPureGitObjects());
  }
}
```

## Implementation Priority

1. **Immediate Fix**: Add lock detection and skip
2. **Better Fix**: Implement pure object creation
3. **Best Fix**: Queue system with pure objects

## Key Insights

- **Never use commands that modify index**: No `add`, `rm`, `mv`
- **Read-only operations are safer**: `ls-files`, `hash-object -w`
- **Object database is concurrent-safe**: Multiple processes can create objects
- **Refs need care**: Use `update-ref` with proper locking

## Testing Strategy

```bash
# Simulate concurrent access
for i in {1..10}; do
  git status &
  timeline save &
  git add . &
done
wait
# Check for any index.lock files
```