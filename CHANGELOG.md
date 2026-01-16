# Changelog

All notable changes to the SailPoint MCP server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-16

### Added
- **v2025 API Support**: Added support for SailPoint's new v2025 API version via `SAILPOINT_API_VERSION` environment variable
  - Defaults to `v3` for backward compatibility
  - Set `SAILPOINT_API_VERSION=v2025` to use the latest API version
  - All endpoints now dynamically route to the configured API version
- **Graceful Startup**: Server now starts successfully without credentials and provides helpful error messages when tools are called
  - Warning logged at startup if credentials are not configured
  - Clear error messages when attempting to use tools without valid credentials

### Performance Improvements
- **HTTP Connection Pooling**: Implemented singleton axios instance with HTTP Keep-Alive
  - Reduced connection overhead by reusing connections across requests
  - Configured connection pool: 50 max sockets, 10 max free sockets, 30-second keep-alive
  - 30-second request timeout added for better reliability
  - Significant performance improvement for sequential API calls

### Changed
- Replaced per-request axios instance creation with singleton pattern
- Token refresh logic now updates existing client instead of creating new instances
- Server version bumped to 1.1.0

### Security
- No vulnerabilities found in dependencies (npm audit clean)
- All credentials properly validated before API calls
- No hardcoded secrets detected

## [1.0.0] - 2026-01-16

### Added
- Initial release with comprehensive SailPoint IdentityNow/ISC API coverage
- 43 tools covering:
  - Identity management (list, get)
  - Account operations (list, get, enable, disable, unlock, entitlements)
  - Access profiles (list, get, create)
  - Roles (list, get, create, assigned identities)
  - Certifications and campaigns (list, get)
  - Workflows (list, get, executions, test)
  - Sources (list, get)
  - Search and aggregation
  - Entitlements (list, get)
  - Access requests (list, create)
  - Identity profiles (list, get)
  - SOD policies and violations (list, get)
- OAuth2 token caching with automatic refresh
- Comprehensive error handling with SailPoint-specific error formatting
