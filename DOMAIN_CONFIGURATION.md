# Domain Configuration Guide

## Current Issue
The `.env.backup` file has domain references scattered throughout different sections, making it difficult to configure for different environments.

## Recommended Reorganization

### 1. Create a Dedicated Domain Section
Move all domain-related configuration to a single section near the top of the file:

```bash
# =============================================================================
# DOMAIN & ENVIRONMENT CONFIGURATION
# =============================================================================
# IMPORTANT: Update these values based on your deployment environment
# 
# For LOCAL DEVELOPMENT:
#   - RP_ID=localhost
#   - ORIGIN=http://localhost:3001
#   - CORS_ORIGIN=http://localhost:3001
#   - ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
#
# For PRODUCTION DEPLOYMENT:
#   - RP_ID=your-actual-domain.com (without https://)
#   - ORIGIN=https://your-actual-domain.com
#   - CORS_ORIGIN=https://your-actual-domain.com
#   - ALLOWED_ORIGINS=https://your-actual-domain.com
#
# Example for DigitalOcean App Platform:
#   - RP_ID=maia-cloud-clean-kjho4.ondigitalocean.app
#   - ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
#   - CORS_ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
#   - ALLOWED_ORIGINS=https://maia-cloud-clean-kjho4.ondigitalocean.app

NODE_ENV=development
PORT=3001
RP_ID=localhost
ORIGIN=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
```

### 2. Variables to Consolidate
The following variables should be moved to the domain section:

- `NODE_ENV` (from APPLICATION CONFIGURATION)
- `PORT` (from APPLICATION CONFIGURATION)
- `RP_ID` (from PASSKEY AUTHENTICATION)
- `ORIGIN` (from PASSKEY AUTHENTICATION)
- `CORS_ORIGIN` (from CORS SETTINGS)
- `ALLOWED_ORIGINS` (from CORS SETTINGS)

### 3. Benefits of This Organization
- **Single source of truth** for domain configuration
- **Clear examples** for different environments
- **Easier deployment** configuration
- **Reduced errors** from mismatched domain settings
- **Better documentation** for team members

### 4. Environment-Specific Examples

#### Local Development
```bash
NODE_ENV=development
RP_ID=localhost
ORIGIN=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:4000
```

#### Production (DigitalOcean)
```bash
NODE_ENV=production
RP_ID=maia-cloud-clean-kjho4.ondigitalocean.app
ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
CORS_ORIGIN=https://maia-cloud-clean-kjho4.ondigitalocean.app
ALLOWED_ORIGINS=https://maia-cloud-clean-kjho4.ondigitalocean.app
```

#### Production (Custom Domain)
```bash
NODE_ENV=production
RP_ID=yourdomain.com
ORIGIN=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

## Implementation Steps
1. Create the new DOMAIN & ENVIRONMENT CONFIGURATION section
2. Move all domain-related variables to this section
3. Remove the scattered domain references from other sections
4. Update the comments to reflect the new organization
5. Test the configuration in both local and production environments
