# Windows Troubleshooting Guide

## Issues and Solutions

### 1. Windows Path Issues in Node Modules

**Problem:** Tests fail on Windows due to path resolution issues in node modules, particularly with Playwright CLI execution.

**Root Cause Analysis:**
Based on the code analysis in `/runner/src/execution/services/execution.service.ts` (lines 1051-1089), the system has built-in Windows path handling:

```javascript
// Handle path differences between Windows and Unix-like systems
let playwrightCliPath;
if (isWindows) {
  // On Windows, use the .cmd extension
  playwrightCliPath = path.join(
    serviceRoot,
    'node_modules',
    '.bin',
    'playwright.cmd',  // Windows requires .cmd extension
  );
} else {
  playwrightCliPath = path.join(
    serviceRoot,
    'node_modules',
    '.bin',
    'playwright',
  );
}
```

**Solutions:**

#### A. Environment Setup
1. **Ensure proper Node.js version:** Use Node.js 18+ on Windows
2. **Install with proper permissions:** Run npm/yarn as Administrator if needed
3. **Use Windows-compatible paths:** The code handles this automatically but verify `node_modules\.bin\playwright.cmd` exists

#### B. Development Environment Fixes
```bash
# 1. Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# 2. Verify Playwright installation
npx playwright install

# 3. For corporate networks, set npm registry if needed
npm config set registry https://registry.npmjs.org/
```

#### C. Code-level Fixes
The execution service now properly handles Windows paths by:
- Using platform-specific Playwright CLI paths (.cmd extension on Windows)
- Skipping Unix-specific chmod commands on Windows
- Using Node.js path.join() for cross-platform path construction

### 2. HTTP 407 Proxy Authentication Error

**Problem:** All monitoring calls fail with HTTP 407 error in corporate networks.

**Root Cause:** Corporate proxy servers require authentication, and the monitoring service doesn't handle proxy settings.

**Solution A: Environment Variables**
Set proxy configuration in your environment:

```bash
# Windows Command Prompt
set HTTP_PROXY=http://username:password@proxy.company.com:8080
set HTTPS_PROXY=http://username:password@proxy.company.com:8080
set NO_PROXY=localhost,127.0.0.1,.local

# Windows PowerShell
$env:HTTP_PROXY="http://username:password@proxy.company.com:8080"
$env:HTTPS_PROXY="http://username:password@proxy.company.com:8080"
$env:NO_PROXY="localhost,127.0.0.1,.local"
```

**Solution B: Code Enhancement**
Add proxy support to the HTTP service in `monitor.service.ts` (around line 299):

```javascript
const requestConfig: any = {
  method: httpMethod,
  url: target,
  timeout,
  headers: {
    'User-Agent': 'SuperTest-Monitor/1.0',
    ...config?.headers
  },
  // Add proxy configuration
  proxy: process.env.HTTP_PROXY ? {
    protocol: 'http',
    host: new URL(process.env.HTTP_PROXY).hostname,
    port: parseInt(new URL(process.env.HTTP_PROXY).port),
    auth: process.env.HTTP_PROXY.includes('@') ? {
      username: new URL(process.env.HTTP_PROXY).username,
      password: new URL(process.env.HTTP_PROXY).password
    } : undefined
  } : false,
  validateStatus: () => true,
};
```

**Solution C: Corporate Network Bypass**
For development/testing, use localhost monitoring or configure network bypass:

```bash
# Add to your hosts file (C:\Windows\System32\drivers\etc\hosts)
127.0.0.1 testsite.local
```

### 3. General Windows Development Setup

#### A. Use WSL2 (Recommended)
```bash
# Install WSL2 with Ubuntu
wsl --install -d Ubuntu

# Run the project in WSL2 environment
cd /mnt/c/your-project-path
npm install
npm run dev
```

#### B. Windows Native Setup
```bash
# Use Windows Terminal or PowerShell as Administrator
# Install required build tools
npm install --global windows-build-tools

# For Playwright browser installation
npx playwright install --with-deps
```

### 4. Docker Development on Windows

#### A. Use Docker Desktop with WSL2 Backend
```yaml
# docker-compose.override.yml for Windows
version: '3.8'
services:
  app:
    volumes:
      # Use relative paths for Windows compatibility
      - ./app:/app
      - /app/node_modules
  
  worker:
    volumes:
      - ./runner:/app
      - /app/node_modules
    environment:
      # Set Windows-specific environment variables
      - PLAYWRIGHT_BROWSERS_PATH=0
```

#### B. Volume Mount Issues
If you encounter permission issues with Docker volumes on Windows:

```bash
# Fix Docker volume permissions
docker-compose down
docker volume prune
docker-compose up --build
```

### 5. Environment-Specific Configuration

#### A. Development Environment Detection
```javascript
// Add to your config
const isWindowsDev = process.platform === 'win32' && process.env.NODE_ENV === 'development';

if (isWindowsDev) {
  // Windows-specific configurations
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.cwd(), '.playwright');
}
```

#### B. Path Handling Best Practices
```javascript
// Always use path.join() for cross-platform compatibility
const configPath = path.join(process.cwd(), 'playwright.config.js');

// Use path.resolve() for absolute paths
const absolutePath = path.resolve(__dirname, '../config');

// For CLI arguments, always quote paths with spaces
const quotedPath = `"${configPath}"`;
```

### 6. Debugging Steps

#### A. Windows-Specific Debugging
```bash
# Check Node.js version and architecture
node -v
node -p "process.arch"
node -p "process.platform"

# Verify Playwright installation
npx playwright --version
dir node_modules\.bin\playwright.cmd

# Test path resolution
node -e "console.log(require('path').join(process.cwd(), 'node_modules', '.bin', 'playwright.cmd'))"
```

#### B. Network Debugging for 407 Errors
```bash
# Check proxy settings
echo %HTTP_PROXY%
echo %HTTPS_PROXY%

# Test direct connection (bypass proxy)
curl -v https://www.google.com

# Test with proxy
curl -v --proxy http://proxy.company.com:8080 https://www.google.com
```

### 7. Production Deployment Considerations

#### A. Windows Server Deployment
- Use Windows Server Core containers for smaller footprint
- Ensure proper certificate handling for HTTPS monitoring
- Configure Windows Defender exclusions for node_modules

#### B. IIS Integration (if needed)
```xml
<!-- web.config for IIS hosting -->
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="DynamicContent">
          <match url="/*" />
          <action type="Rewrite" url="server.js"/>
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

## Quick Setup (Automated)

**For fast setup, run the automated Windows setup script:**
```bash
# Command Prompt (as Administrator)
setup-windows.bat

# PowerShell (Recommended)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\setup-windows.ps1
```

**Or copy the environment template:**
```bash
copy .env.windows.example .env.local
# Then edit .env.local with your proxy settings
```

## Quick Fix Checklist

1. **Immediate Actions:**
   - [ ] Set proxy environment variables if in corporate network
   - [ ] Reinstall node_modules with `npm ci`
   - [ ] Run `npx playwright install`
   - [ ] Verify playwright.cmd exists in node_modules\.bin

2. **Environment Setup:**
   - [ ] Use Node.js 18+ LTS version
   - [ ] Install Visual Studio Build Tools (if native compilation needed)
   - [ ] Configure Windows Terminal with proper encoding

3. **Testing:**
   - [ ] Test simple HTTP request outside corporate network
   - [ ] Verify Playwright can launch browsers
   - [ ] Check Docker Desktop WSL2 integration

4. **Long-term Solutions:**
   - [ ] Consider WSL2 for development
   - [ ] Implement proper proxy configuration in code
   - [ ] Set up CI/CD with Windows agents if deploying to Windows

## Additional Resources

- [Playwright on Windows Documentation](https://playwright.dev/docs/installation#windows)
- [Node.js Windows Troubleshooting](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [Docker Desktop WSL2 Backend](https://docs.docker.com/desktop/wsl/)
- [Corporate Proxy Configuration](https://docs.npmjs.com/cli/v9/using-npm/config#proxy)