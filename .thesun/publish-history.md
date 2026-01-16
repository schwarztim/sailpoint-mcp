# SailPoint MCP Server - Publish History

## Version 1.1.0 - 2026-01-16

### Performance Improvements
**Status**: ✅ Completed

#### HTTP Connection Pooling
- **Before**: Created new axios instance for each API call, no connection reuse
- **After**: Singleton axios instance with HTTP Keep-Alive
  - 50 max sockets
  - 10 max free sockets
  - 30-second keep-alive timeout
  - 30-second request timeout
- **Impact**: Significant performance improvement for sequential API calls by eliminating TCP connection overhead

#### Token Management
- Already had token caching (60-second buffer)
- Improved to update existing client instead of creating new instances
- No measurable change needed - already optimal

### Security Enhancements
**Status**: ✅ Clean

- npm audit: 0 vulnerabilities
- No hardcoded secrets found
- Input validation present on all tool parameters
- Graceful startup without credentials (no crashes)

### Feature Additions
**Status**: ✅ Completed

#### v2025 API Support
- Added `SAILPOINT_API_VERSION` environment variable (defaults to `v3`)
- All endpoints now support both v3 and v2025 API versions
- Dynamic path routing via `apiPath()` helper function
- Backward compatible - existing users unaffected

#### Graceful Startup
- Server now starts successfully without credentials
- Provides helpful warning message at startup
- Clear error messages when tools are called without valid credentials
- Prevents startup crashes in development/testing scenarios

### Code Quality
**Status**: ✅ Improved

- ✅ TypeScript compilation successful
- ✅ No linting errors
- ✅ Proper error handling with informative messages
- ⚠️ No tests exist (future enhancement opportunity)

### Documentation
**Status**: ✅ Updated

- ✅ CHANGELOG.md created with full version history
- ✅ README.md updated with:
  - API version configuration
  - Performance features section
  - v2025 API capabilities
- ✅ Inline code comments for new features

## Unresolved Issues

None identified.

## Future Enhancement Opportunities

1. **Testing**: Add unit and integration tests
2. **Advanced v2025 Features**: Add tools for v2025-specific endpoints:
   - Configuration Hub operations
   - Identity deletion workflows
   - Machine account management
   - Data segmentation
   - IAI capabilities (outliers, role mining)
   - Non-employee lifecycle management
3. **Performance Metrics**: Add optional performance logging
4. **Rate Limiting**: Implement intelligent rate limiting/backoff
5. **Batch Operations**: Add batch endpoints for bulk operations

## Build & Test Results

```bash
Build: ✅ SUCCESS (npm run build)
npm audit: ✅ 0 vulnerabilities
Startup: ✅ Graceful (with and without credentials)
```

## Comparison to Other MCP Servers

This implementation follows best practices seen in other enterprise MCP servers:
- Connection pooling (similar to Elastic MCP)
- Token caching (similar to Microsoft Teams MCP)
- Graceful startup (similar to GitHub MCP)
- Multi-version API support (unique feature)
