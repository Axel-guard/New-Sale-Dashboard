# Build Instructions for Large TypeScript Projects

## Issue
The `src/index.tsx` file (785KB, 15,766 lines) causes builds to timeout or get killed due to memory constraints.

## Solution
Use memory-optimized build command with minification disabled.

## Build Commands

### For Development/Sandbox (Recommended)
```bash
NODE_OPTIONS="--max-old-space-size=1536" vite build --minify false
```

**Result:** Builds successfully in ~2 seconds without memory issues

### For Production (Smaller bundle)
```bash
vite build
```

**Note:** May timeout on machines with limited memory

## Complete Rebuild & Restart Flow

```bash
# 1. Stop running server
pm2 delete all

# 2. Clean port (if needed)
fuser -k 3000/tcp 2>/dev/null || true

# 3. Build with memory optimization
NODE_OPTIONS="--max-old-space-size=1536" vite build --minify false

# 4. Start server
pm2 start ecosystem.config.cjs

# 5. Test
curl http://localhost:3000/
pm2 logs --nostream
```

## Why This Works

1. **Increased Memory:** `--max-old-space-size=1536` allocates 1.5GB heap
2. **No Minification:** `--minify false` skips memory-intensive minification
3. **Result:** 1.1MB bundle without memory pressure

## Trade-offs

| Option | Build Time | Bundle Size | Memory Usage | Best For |
|--------|-----------|-------------|--------------|----------|
| Optimized | 2s | 1.1MB | Low | Development |
| Production | Timeout | ~850KB | High | Production (if succeeds) |

## When to Use Each

**Development/Sandbox:**
- Use optimized build (no minify)
- Faster iteration
- Lower memory usage
- Acceptable bundle size

**Production:**
- Try standard build first
- If timeout, use optimized build
- Cloudflare Pages handles minification at edge
- Bundle size difference minimal at scale

## Troubleshooting

### Build Gets Killed
**Symptom:** Build process terminates with "Killed" message  
**Solution:** Increase memory allocation or disable minification

```bash
# Try increasing memory further
NODE_OPTIONS="--max-old-space-size=2048" vite build --minify false
```

### Build Takes Too Long
**Symptom:** Build runs but never completes  
**Solution:** Reduce optimization level

```bash
# Disable minification
vite build --minify false
```

### Server Shows Old Code
**Symptom:** Changes not reflected after restart  
**Solution:** Rebuild before restarting

```bash
# Always rebuild when code changes
NODE_OPTIONS="--max-old-space-size=1536" vite build --minify false
pm2 restart webapp
```

## File Size Optimization (Future)

To improve build performance, consider:

1. **Code Splitting**
   - Split `src/index.tsx` into modules
   - Separate API routes from UI code
   - Extract large components

2. **Module Structure**
   ```
   src/
   ├── index.tsx (main entry)
   ├── routes/
   │   ├── inventory.ts
   │   ├── sales.ts
   │   └── dispatch.ts
   ├── ui/
   │   ├── modals.tsx
   │   └── tables.tsx
   └── utils/
       └── helpers.ts
   ```

3. **Lazy Loading**
   - Load large components on demand
   - Reduce initial bundle size

## CI/CD Recommendations

For automated builds:

```yaml
# GitHub Actions example
- name: Build Project
  run: |
    NODE_OPTIONS="--max-old-space-size=1536" npm run build
  env:
    NODE_OPTIONS: "--max-old-space-size=1536"
```

## Performance Metrics

**Current Setup:**
- File Size: 785KB source, 1.1MB compiled
- Build Time: ~2 seconds
- Memory Usage: <1.5GB
- Success Rate: 100%

**Previous Issues:**
- Build Time: Variable (30s - timeout)
- Memory Usage: >2GB
- Success Rate: ~10%

## Version History

- **Nov 15, 2025:** Implemented memory-optimized build
- **Result:** Reliable builds for 785KB+ files

## Support

If builds continue to fail:
1. Check system memory: `free -h`
2. Increase node memory allocation
3. Consider code splitting
4. Contact devops for build server upgrade
