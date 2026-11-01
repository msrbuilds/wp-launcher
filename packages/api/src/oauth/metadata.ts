import { READ_SCOPES, SCOPES } from './scopes';
import { endpoints, issuer, mcpResourceUrl } from './urls';

/** RFC 8414 authorisation server metadata. */
export function authorizationServerMetadata() {
  const e = endpoints();
  return {
    issuer: issuer(),
    authorization_endpoint: e.authorize,
    token_endpoint: e.token,
    registration_endpoint: e.register,
    revocation_endpoint: e.revoke,
    scopes_supported: [...SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/**
 * RFC 9728 protected resource metadata. `scopes_supported` is deliberately the
 * minimal read set; write scopes arrive by step-up or at first consent.
 */
export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...READ_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'WP Launcher',
  };
}
