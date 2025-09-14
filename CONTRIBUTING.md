# Contributing to Supercheck

Thanks for your interest in contributing to Supercheck! We welcome contributions from the community.

## 🚀 Getting Started

1. **Fork the repository** and clone your fork
2. **Install dependencies** for both app and worker:
   ```bash
   cd app && npm install
   cd ../worker && npm install
   ```
3. **Set up your environment** using `.env.example` as a template
4. **Start the development environment** with Docker:
   ```bash
   docker-compose up -d
   ```

## 📋 Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding conventions:
   - Follow existing code style and patterns
   - Write meaningful commit messages
   - Add tests for new functionality when applicable

3. **Test your changes**:
   ```bash
   # App service
   cd app && npm run lint && npm run build

   # Worker service
   cd worker && npm run lint && npm run test
   ```

4. **Submit a pull request** with:
   - Clear description of changes
   - Reference any related issues
   - Screenshots for UI changes

## 🏗️ Project Structure

- `/app` - Next.js frontend and API routes
- `/worker` - NestJS worker service for test execution
- `/scripts` - Build and deployment scripts

## 🐛 Bug Reports

Please open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, etc.)

## 💡 Feature Requests

Open an issue with:
- Description of the feature
- Use case and motivation
- Any implementation ideas

## 📝 Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Keep functions small and focused
- Add JSDoc comments for public APIs

## 🔒 Security

Please report security vulnerabilities privately by emailing the maintainers rather than opening public issues.

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project.