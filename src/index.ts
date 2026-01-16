#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance, AxiosError } from "axios";

// Environment variables
const SAILPOINT_BASE_URL = process.env.SAILPOINT_BASE_URL || "";
const SAILPOINT_CLIENT_ID = process.env.SAILPOINT_CLIENT_ID || "";
const SAILPOINT_CLIENT_SECRET = process.env.SAILPOINT_CLIENT_SECRET || "";
const SAILPOINT_API_VERSION = process.env.SAILPOINT_API_VERSION || "v3"; // v3 or v2025

// Token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Singleton axios instance with connection pooling
let apiClient: AxiosInstance | null = null;

// Create or get cached axios instance with connection pooling
const getApiClient = async (): Promise<AxiosInstance> => {
  // Update token if needed
  const token = await getAccessToken();

  // Create singleton instance with connection pooling
  if (!apiClient) {
    apiClient = axios.create({
      baseURL: SAILPOINT_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
      // Enable HTTP Keep-Alive for connection pooling
      httpAgent: new (await import('http')).Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10
      }),
      httpsAgent: new (await import('https')).Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10
      }),
      timeout: 30000, // 30 second timeout
    });
  }

  // Update authorization header with current token
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

  return apiClient;
};

// OAuth2 token management
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60 second buffer)
  if (accessToken && tokenExpiry > now + 60000) {
    return accessToken;
  }

  // Request new token
  const tokenUrl = `${SAILPOINT_BASE_URL}/oauth/token`;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SAILPOINT_CLIENT_ID,
    client_secret: SAILPOINT_CLIENT_SECRET,
  });

  try {
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    accessToken = response.data.access_token;
    // Set expiry based on expires_in (default to 12 minutes if not provided)
    const expiresIn = response.data.expires_in || 720;
    tokenExpiry = now + expiresIn * 1000;

    return accessToken!;
  } catch (error) {
    const axiosError = error as AxiosError;
    throw new Error(
      `Failed to obtain access token: ${axiosError.message}`
    );
  }
}

// Helper to format API errors
function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; detailCode?: string; messages?: Array<{ text: string }> }>;
    const data = axiosError.response?.data;
    if (data?.messages && Array.isArray(data.messages)) {
      return data.messages.map((m) => m.text).join("; ");
    }
    if (data?.message) {
      return `${data.detailCode || "Error"}: ${data.message}`;
    }
    return `HTTP ${axiosError.response?.status}: ${axiosError.message}`;
  }
  return String(error);
}

// Helper to validate credentials before making API calls
function validateCredentials(): void {
  const missingVars: string[] = [];

  if (!SAILPOINT_BASE_URL) {
    missingVars.push("SAILPOINT_BASE_URL");
  }
  if (!SAILPOINT_CLIENT_ID) {
    missingVars.push("SAILPOINT_CLIENT_ID");
  }
  if (!SAILPOINT_CLIENT_SECRET) {
    missingVars.push("SAILPOINT_CLIENT_SECRET");
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}. ` +
      `Please set SAILPOINT_BASE_URL to your tenant API URL (e.g., https://acme.api.identitynow.com), ` +
      `and SAILPOINT_CLIENT_ID and SAILPOINT_CLIENT_SECRET from your SailPoint tenant Personal Access Token.`
    );
  }
}

// Define tools
const tools: Tool[] = [
  // Identities
  {
    name: "list_identities",
    description:
      "List identities in SailPoint with optional filtering. Returns identity ID, name, email, lifecycle state, and manager information.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results (default 50, max 250)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description:
            "Filter expression (e.g., 'name co \"John\"' or 'lifecycleState eq \"active\"')",
        },
        sorters: {
          type: "string",
          description: "Sort fields (e.g., 'name' or '-created')",
        },
      },
    },
  },
  {
    name: "get_identity",
    description:
      "Get detailed information about a specific identity by ID, including attributes, accounts, and access.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The identity ID",
        },
      },
      required: ["id"],
    },
  },
  // Accounts
  {
    name: "list_accounts",
    description:
      "List accounts across all sources with filtering options. Returns account ID, name, source, identity owner, and status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results (default 50, max 250)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description:
            "Filter expression (e.g., 'sourceId eq \"abc123\"' or 'disabled eq true')",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
      },
    },
  },
  {
    name: "get_account",
    description:
      "Get detailed information about a specific account including attributes and entitlements.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The account ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_account_entitlements",
    description: "List entitlements assigned to a specific account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        accountId: {
          type: "string",
          description: "The account ID",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
      },
      required: ["accountId"],
    },
  },
  {
    name: "enable_account",
    description: "Enable a disabled account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The account ID to enable",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "disable_account",
    description: "Disable an active account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The account ID to disable",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "unlock_account",
    description: "Unlock a locked account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The account ID to unlock",
        },
      },
      required: ["id"],
    },
  },
  // Access Profiles
  {
    name: "list_access_profiles",
    description:
      "List access profiles with optional filtering. Access profiles bundle entitlements for role-based access.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results (default 50, max 250)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description: "Filter expression (e.g., 'name co \"Admin\"')",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
        forSubadmin: {
          type: "string",
          description: "Filter for access profiles manageable by subadmin",
        },
      },
    },
  },
  {
    name: "get_access_profile",
    description:
      "Get detailed information about a specific access profile including entitlements.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The access profile ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_access_profile",
    description: "Create a new access profile.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Name of the access profile",
        },
        description: {
          type: "string",
          description: "Description of the access profile",
        },
        sourceId: {
          type: "string",
          description: "Source ID the access profile is associated with",
        },
        ownerId: {
          type: "string",
          description: "Identity ID of the owner",
        },
        entitlementIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of entitlement IDs to include",
        },
        requestable: {
          type: "boolean",
          description: "Whether the access profile can be requested",
        },
      },
      required: ["name", "sourceId", "ownerId"],
    },
  },
  // Roles
  {
    name: "list_roles",
    description:
      "List roles with optional filtering. Roles bundle access profiles and entitlements for business functions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results (default 50, max 250)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description: "Filter expression (e.g., 'name co \"Engineer\"')",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
        forSubadmin: {
          type: "string",
          description: "Filter for roles manageable by subadmin",
        },
      },
    },
  },
  {
    name: "get_role",
    description:
      "Get detailed information about a specific role including access profiles and memberships.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The role ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_role_assigned_identities",
    description: "List identities assigned to a specific role.",
    inputSchema: {
      type: "object" as const,
      properties: {
        roleId: {
          type: "string",
          description: "The role ID",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
      },
      required: ["roleId"],
    },
  },
  {
    name: "create_role",
    description: "Create a new role.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Name of the role",
        },
        description: {
          type: "string",
          description: "Description of the role",
        },
        ownerId: {
          type: "string",
          description: "Identity ID of the owner",
        },
        accessProfileIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of access profile IDs to include",
        },
        requestable: {
          type: "boolean",
          description: "Whether the role can be requested",
        },
      },
      required: ["name", "ownerId"],
    },
  },
  // Certifications
  {
    name: "list_certifications",
    description:
      "List active certification reviews. Certifications are access review campaigns.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description: "Filter expression",
        },
      },
    },
  },
  {
    name: "get_certification",
    description:
      "Get detailed information about a specific certification including items to review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The certification ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_certification_campaigns",
    description: "List certification campaigns with status and progress.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description:
            "Filter expression (e.g., 'status eq \"ACTIVE\"')",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
      },
    },
  },
  {
    name: "get_certification_campaign",
    description:
      "Get detailed information about a certification campaign including statistics.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The campaign ID",
        },
      },
      required: ["id"],
    },
  },
  // Workflows
  {
    name: "list_workflows",
    description: "List workflows (automation scripts) in the tenant.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
      },
    },
  },
  {
    name: "get_workflow",
    description:
      "Get detailed information about a specific workflow including steps and triggers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The workflow ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_workflow_executions",
    description: "List execution history for a specific workflow.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workflowId: {
          type: "string",
          description: "The workflow ID",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "test_workflow",
    description: "Test a workflow with sample input.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workflowId: {
          type: "string",
          description: "The workflow ID",
        },
        input: {
          type: "object",
          description: "Input data for the workflow test",
        },
      },
      required: ["workflowId"],
    },
  },
  // Sources
  {
    name: "list_sources",
    description:
      "List connected sources (identity repositories). Sources are the systems SailPoint connects to.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description:
            "Filter expression (e.g., 'type eq \"Active Directory\"')",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
      },
    },
  },
  {
    name: "get_source",
    description:
      "Get detailed information about a specific source including connection status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The source ID",
        },
      },
      required: ["id"],
    },
  },
  // Search
  {
    name: "search",
    description:
      "Perform a search across identities, accounts, access profiles, roles, or entitlements using query syntax.",
    inputSchema: {
      type: "object" as const,
      properties: {
        indices: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "identities",
              "accounts",
              "accessprofiles",
              "roles",
              "entitlements",
              "events",
            ],
          },
          description: "Indices to search (e.g., ['identities', 'accounts'])",
        },
        query: {
          type: "string",
          description:
            "Search query string (e.g., 'name:John AND department:Engineering')",
        },
        queryType: {
          type: "string",
          enum: ["DSL", "SAILPOINT", "TEXT", "TYPEAHEAD"],
          description: "Query type (default: SAILPOINT)",
        },
        sort: {
          type: "array",
          items: { type: "string" },
          description: "Sort fields (e.g., ['name', '-created'])",
        },
        searchAfter: {
          type: "array",
          items: { type: "string" },
          description: "Pagination cursor for results beyond 10,000",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 100, max 10000)",
        },
      },
      required: ["indices", "query"],
    },
  },
  {
    name: "search_aggregate",
    description:
      "Perform aggregate queries on search indices for analytics (counts, groupings, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        indices: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "identities",
              "accounts",
              "accessprofiles",
              "roles",
              "entitlements",
              "events",
            ],
          },
          description: "Indices to aggregate",
        },
        query: {
          type: "string",
          description: "Search query to filter documents",
        },
        aggregationType: {
          type: "string",
          enum: [
            "DSL",
            "TERMS",
            "DATE_HISTOGRAM",
            "METRIC",
            "NESTED",
          ],
          description: "Type of aggregation",
        },
        aggregationField: {
          type: "string",
          description:
            "Field to aggregate on (e.g., 'department', 'source.name')",
        },
        limit: {
          type: "number",
          description: "Maximum buckets for terms aggregation",
        },
      },
      required: ["indices", "aggregationType", "aggregationField"],
    },
  },
  // Entitlements
  {
    name: "list_entitlements",
    description:
      "List entitlements (permissions/privileges) across sources.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description:
            "Filter expression (e.g., 'source.id eq \"abc123\"')",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
      },
    },
  },
  {
    name: "get_entitlement",
    description: "Get detailed information about a specific entitlement.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The entitlement ID",
        },
      },
      required: ["id"],
    },
  },
  // Access Requests
  {
    name: "list_access_requests",
    description: "List access requests with status filtering.",
    inputSchema: {
      type: "object" as const,
      properties: {
        requestedFor: {
          type: "string",
          description: "Identity ID the request was made for",
        },
        requestedBy: {
          type: "string",
          description: "Identity ID who made the request",
        },
        filters: {
          type: "string",
          description:
            "Filter expression (e.g., 'status eq \"PENDING\"')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
      },
    },
  },
  {
    name: "create_access_request",
    description:
      "Create a new access request for roles, access profiles, or entitlements.",
    inputSchema: {
      type: "object" as const,
      properties: {
        requestedFor: {
          type: "array",
          items: { type: "string" },
          description: "Array of identity IDs to request access for",
        },
        requestedItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["ACCESS_PROFILE", "ROLE", "ENTITLEMENT"],
              },
              id: { type: "string" },
              comment: { type: "string" },
            },
            required: ["type", "id"],
          },
          description: "Items to request (access profiles, roles, or entitlements)",
        },
        requestType: {
          type: "string",
          enum: ["GRANT_ACCESS", "REVOKE_ACCESS"],
          description: "Whether to grant or revoke access",
        },
      },
      required: ["requestedFor", "requestedItems"],
    },
  },
  // Identity Profiles
  {
    name: "list_identity_profiles",
    description:
      "List identity profiles (configurations for how identities are created/managed).",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description: "Filter expression",
        },
        sorters: {
          type: "string",
          description: "Sort fields",
        },
      },
    },
  },
  {
    name: "get_identity_profile",
    description:
      "Get detailed information about an identity profile including attribute mappings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The identity profile ID",
        },
      },
      required: ["id"],
    },
  },
  // SOD Policies
  {
    name: "list_sod_policies",
    description:
      "List Separation of Duties (SOD) policies for compliance monitoring.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
        filters: {
          type: "string",
          description: "Filter expression",
        },
      },
    },
  },
  {
    name: "get_sod_policy",
    description: "Get detailed information about a specific SOD policy.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The SOD policy ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_sod_violations",
    description: "List SOD violations for review and remediation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results",
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
        },
      },
    },
  },
];

// Tool handlers
async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  // Validate credentials when a tool is actually called
  validateCredentials();

  const api = await getApiClient();

  // Helper to get API path with correct version
  const apiPath = (path: string): string => {
    return path.replace("/v3/", `/${SAILPOINT_API_VERSION}/`);
  };

  switch (name) {
    // Identities
    case "list_identities": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;

      const response = await api.get(apiPath("/v3/public-identities"), { params });
      return response.data;
    }

    case "get_identity": {
      const response = await api.get(apiPath(`/v3/public-identities/${args.id}`));
      return response.data;
    }

    // Accounts
    case "list_accounts": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;

      const response = await api.get(apiPath("/v3/accounts"), { params });
      return response.data;
    }

    case "get_account": {
      const response = await api.get(apiPath(`/v3/accounts/${args.id}`));
      return response.data;
    }

    case "get_account_entitlements": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;

      const response = await api.get(
        apiPath(`/v3/accounts/${args.accountId}/entitlements`),
        { params }
      );
      return response.data;
    }

    case "enable_account": {
      const response = await api.post(apiPath(`/v3/accounts/${args.id}/enable`));
      return response.data;
    }

    case "disable_account": {
      const response = await api.post(apiPath(`/v3/accounts/${args.id}/disable`));
      return response.data;
    }

    case "unlock_account": {
      const response = await api.post(apiPath(`/v3/accounts/${args.id}/unlock`));
      return response.data;
    }

    // Access Profiles
    case "list_access_profiles": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;
      if (args.forSubadmin) params["for-subadmin"] = args.forSubadmin as string;

      const response = await api.get(apiPath("/v3/access-profiles"), { params });
      return response.data;
    }

    case "get_access_profile": {
      const response = await api.get(apiPath(`/v3/access-profiles/${args.id}`));
      return response.data;
    }

    case "create_access_profile": {
      const body: Record<string, unknown> = {
        name: args.name,
        source: { id: args.sourceId, type: "SOURCE" },
        owner: { id: args.ownerId, type: "IDENTITY" },
      };
      if (args.description) body.description = args.description;
      if (args.requestable !== undefined) body.requestable = args.requestable;
      if (args.entitlementIds) {
        body.entitlements = (args.entitlementIds as string[]).map((id) => ({
          id,
          type: "ENTITLEMENT",
        }));
      }

      const response = await api.post(apiPath("/v3/access-profiles"), body);
      return response.data;
    }

    // Roles
    case "list_roles": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;
      if (args.forSubadmin) params["for-subadmin"] = args.forSubadmin as string;

      const response = await api.get(apiPath("/v3/roles"), { params });
      return response.data;
    }

    case "get_role": {
      const response = await api.get(apiPath(`/v3/roles/${args.id}`));
      return response.data;
    }

    case "get_role_assigned_identities": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;

      const response = await api.get(
        apiPath(`/v3/roles/${args.roleId}/assigned-identities`),
        { params }
      );
      return response.data;
    }

    case "create_role": {
      const body: Record<string, unknown> = {
        name: args.name,
        owner: { id: args.ownerId, type: "IDENTITY" },
      };
      if (args.description) body.description = args.description;
      if (args.requestable !== undefined) body.requestable = args.requestable;
      if (args.accessProfileIds) {
        body.accessProfiles = (args.accessProfileIds as string[]).map((id) => ({
          id,
          type: "ACCESS_PROFILE",
        }));
      }

      const response = await api.post(apiPath("/v3/roles"), body);
      return response.data;
    }

    // Certifications
    case "list_certifications": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;

      const response = await api.get(apiPath("/v3/certifications"), { params });
      return response.data;
    }

    case "get_certification": {
      const response = await api.get(apiPath(`/v3/certifications/${args.id}`));
      return response.data;
    }

    case "list_certification_campaigns": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;

      const response = await api.get(apiPath("/v3/campaigns"), { params });
      return response.data;
    }

    case "get_certification_campaign": {
      const response = await api.get(apiPath(`/v3/campaigns/${args.id}`));
      return response.data;
    }

    // Workflows
    case "list_workflows": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;

      const response = await api.get(apiPath("/v3/workflows"), { params });
      return response.data;
    }

    case "get_workflow": {
      const response = await api.get(apiPath(`/v3/workflows/${args.id}`));
      return response.data;
    }

    case "get_workflow_executions": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;

      const response = await api.get(
        apiPath(`/v3/workflows/${args.workflowId}/executions`),
        { params }
      );
      return response.data;
    }

    case "test_workflow": {
      const response = await api.post(apiPath(`/v3/workflows/${args.workflowId}/test`), {
        input: args.input || {},
      });
      return response.data;
    }

    // Sources
    case "list_sources": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;

      const response = await api.get(apiPath("/v3/sources"), { params });
      return response.data;
    }

    case "get_source": {
      const response = await api.get(apiPath(`/v3/sources/${args.id}`));
      return response.data;
    }

    // Search
    case "search": {
      const queryObj: Record<string, unknown> = {
        query: args.query,
      };
      if (args.queryType) {
        queryObj.queryType = args.queryType;
      }

      const body: Record<string, unknown> = {
        indices: args.indices,
        query: queryObj,
      };
      if (args.sort) body.sort = args.sort;
      if (args.searchAfter) body.searchAfter = args.searchAfter;

      const params: Record<string, number | boolean> = {};
      if (args.limit) params.limit = args.limit as number;
      params.count = true;

      const response = await api.post(apiPath("/v3/search"), body, { params });
      return {
        results: response.data,
        totalCount: response.headers["x-total-count"],
      };
    }

    case "search_aggregate": {
      const aggregationsRequest: Record<string, unknown> = {
        field: args.aggregationField,
      };
      if (args.limit) {
        aggregationsRequest.size = args.limit;
      }

      const body: Record<string, unknown> = {
        indices: args.indices,
        aggregationType: args.aggregationType,
        aggregationsRequest: aggregationsRequest,
      };
      if (args.query) {
        body.query = { query: args.query };
      }

      const response = await api.post(apiPath("/v3/search/aggregate"), body);
      return response.data;
    }

    // Entitlements
    case "list_entitlements": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;

      const response = await api.get(apiPath("/v3/entitlements"), { params });
      return response.data;
    }

    case "get_entitlement": {
      const response = await api.get(apiPath(`/v3/entitlements/${args.id}`));
      return response.data;
    }

    // Access Requests
    case "list_access_requests": {
      const params: Record<string, string | number> = {};
      if (args.requestedFor)
        params["requested-for"] = args.requestedFor as string;
      if (args.requestedBy) params["requested-by"] = args.requestedBy as string;
      if (args.filters) params.filters = args.filters as string;
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;

      const response = await api.get(apiPath("/v3/access-requests"), { params });
      return response.data;
    }

    case "create_access_request": {
      const body: Record<string, unknown> = {
        requestedFor: args.requestedFor,
        requestedItems: args.requestedItems,
        requestType: args.requestType || "GRANT_ACCESS",
      };

      const response = await api.post(apiPath("/v3/access-requests"), body);
      return response.data;
    }

    // Identity Profiles
    case "list_identity_profiles": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;
      if (args.sorters) params.sorters = args.sorters as string;

      const response = await api.get(apiPath("/v3/identity-profiles"), { params });
      return response.data;
    }

    case "get_identity_profile": {
      const response = await api.get(apiPath(`/v3/identity-profiles/${args.id}`));
      return response.data;
    }

    // SOD Policies
    case "list_sod_policies": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;
      if (args.filters) params.filters = args.filters as string;

      const response = await api.get(apiPath("/v3/sod-policies"), { params });
      return response.data;
    }

    case "get_sod_policy": {
      const response = await api.get(apiPath(`/v3/sod-policies/${args.id}`));
      return response.data;
    }

    case "list_sod_violations": {
      const params: Record<string, string | number> = {};
      if (args.limit) params.limit = args.limit as number;
      if (args.offset) params.offset = args.offset as number;

      const response = await api.get(apiPath("/v3/sod-violations/predicted"), { params });
      return response.data;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Main server setup
async function main() {
  // Log startup info but don't validate credentials yet - allow graceful startup
  const hasCredentials = SAILPOINT_BASE_URL && SAILPOINT_CLIENT_ID && SAILPOINT_CLIENT_SECRET;
  if (!hasCredentials) {
    console.error("Warning: SailPoint credentials not configured. Set SAILPOINT_BASE_URL, SAILPOINT_CLIENT_ID, and SAILPOINT_CLIENT_SECRET environment variables.");
  } else {
    console.error("SailPoint MCP Server initialized for:", SAILPOINT_BASE_URL);
  }

  const server = new Server(
    {
      name: "sailpoint-mcp",
      version: "1.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleTool(name, args as Record<string, unknown>);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = formatError(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SailPoint MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
