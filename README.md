# SailPoint MCP Server

MCP server for SailPoint IdentityNow/Identity Security Cloud API. Provides comprehensive tools for identity governance, access management, and compliance operations.

## Features

- **Identity Management**: List, search, and get identity details
- **Account Operations**: List accounts, enable/disable, unlock, view entitlements
- **Access Profiles**: Create, list, and manage access profile bundles
- **Roles**: Create, list, and manage role definitions
- **Certifications**: View certification campaigns and access reviews
- **Workflows**: List, test, and monitor automation workflows
- **Search**: Full-text search across identities, accounts, roles, and more
- **SOD Policies**: View Separation of Duties policies and violations
- **Sources**: List and inspect connected identity sources

## Configuration

Set the following environment variables:

```bash
SAILPOINT_BASE_URL=https://your-tenant.api.identitynow.com
SAILPOINT_CLIENT_ID=your-client-id
SAILPOINT_CLIENT_SECRET=your-client-secret
```

### Getting Credentials

1. Log into your SailPoint Identity Security Cloud tenant
2. Go to **Preferences** (under your username dropdown)
3. Select **Personal Access Tokens** on the left
4. Click **New Token** to generate a new PAT
5. Copy the **Client ID** and **Client Secret**

Your base URL follows the format: `https://{tenant}.api.identitynow.com`

## Available Tools

### Identities
- `list_identities` - List identities with filtering
- `get_identity` - Get detailed identity information

### Accounts
- `list_accounts` - List accounts across sources
- `get_account` - Get account details
- `get_account_entitlements` - List account entitlements
- `enable_account` - Enable a disabled account
- `disable_account` - Disable an account
- `unlock_account` - Unlock a locked account

### Access Profiles
- `list_access_profiles` - List access profiles
- `get_access_profile` - Get access profile details
- `create_access_profile` - Create a new access profile

### Roles
- `list_roles` - List roles
- `get_role` - Get role details
- `get_role_assigned_identities` - List identities assigned to a role
- `create_role` - Create a new role

### Certifications
- `list_certifications` - List active certifications
- `get_certification` - Get certification details
- `list_certification_campaigns` - List certification campaigns
- `get_certification_campaign` - Get campaign details

### Workflows
- `list_workflows` - List automation workflows
- `get_workflow` - Get workflow details
- `get_workflow_executions` - View workflow execution history
- `test_workflow` - Test a workflow

### Sources
- `list_sources` - List connected sources
- `get_source` - Get source details

### Search
- `search` - Search across indices (identities, accounts, roles, etc.)
- `search_aggregate` - Aggregate analytics queries

### Entitlements
- `list_entitlements` - List entitlements
- `get_entitlement` - Get entitlement details

### Access Requests
- `list_access_requests` - List access requests
- `create_access_request` - Create a new access request

### Identity Profiles
- `list_identity_profiles` - List identity profiles
- `get_identity_profile` - Get identity profile details

### SOD Policies
- `list_sod_policies` - List SOD policies
- `get_sod_policy` - Get SOD policy details
- `list_sod_violations` - List SOD violations

## Usage Examples

### Search for identities
```json
{
  "indices": ["identities"],
  "query": "name:John AND department:Engineering"
}
```

### List active access requests
```json
{
  "filters": "status eq \"PENDING\""
}
```

### Create an access request
```json
{
  "requestedFor": ["identity-id-1"],
  "requestedItems": [
    {
      "type": "ROLE",
      "id": "role-id",
      "comment": "Need access for project X"
    }
  ]
}
```

## Building

```bash
npm install
npm run build
```

## License

MIT
