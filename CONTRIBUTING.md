# Contributing to AiVI

Thank you for your interest in contributing to AiVI — AI Visibility Inspector!

## Development Philosophy

AiVI follows the Papa Fuego development philosophy with strict adherence to:
- **AI-Gated Analysis**: All semantic checks must be performed by AI backend
- **Abort on Failure**: Never show partial results; display clear abort banner if AI unavailable
- **UI Consistency**: Maintain identical look and feel between Classic and Gutenberg editors
- **Defensive Coding**: Assume failures at every layer and handle gracefully

## Getting Started

### Prerequisites

- WordPress 5.0+ installation
- PHP 7.4+ 
- Node.js 14+ (for asset building)
- Git

### Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/[organization]/ai-visibility-inspector.git
   cd ai-visibility-inspector
   ```

2. Create a development branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Install WordPress locally (using WP Local, Local by Flywheel, or similar)

4. Symlink plugin to WordPress:
   ```bash
   # On Windows
   mklink /D "path/to/wp-content/plugins/ai-visibility-inspector" "path/to/your/clone"
   ```

5. Activate plugin in WordPress admin

## Code Standards

### PHP

- Follow WordPress Coding Standards
- Use strict typing where possible
- Always sanitize inputs and escape outputs
- Include PHPDoc blocks for all classes and methods
- Use namespaces consistently (`AiVI\`)

### JavaScript

- Use ES6+ features supported by WordPress
- Follow WordPress JavaScript Coding Standards
- Use defensive programming patterns
- Maintain compatibility with both Classic and Gutenberg

### CSS

- Use BEM methodology for class names
- Ensure styles work in both editor environments
- Use CSS variables for consistent theming
- Mobile-first responsive design

## Architecture Guidelines

### Class Structure

- Each major feature should have its own class in `includes/`
- Use singleton pattern for main classes
- Register hooks in constructors
- Keep methods focused and testable

### REST API

- All endpoints must use `aivi/v1` namespace
- Always include permission callbacks
- Validate and sanitize all inputs
- Return structured JSON responses
- Handle errors gracefully with proper HTTP status codes

### UI Components

- Maintain identical DOM structure for Classic and Gutenberg
- Use shared CSS classes
- Test in both editor environments
- Preserve visual hierarchy and behavior

## Testing

### Unit Tests

```bash
# Run PHP unit tests
./vendor/bin/phpunit

# Run JavaScript tests
npm test
```

### Integration Tests

- Test REST endpoints directly
- Verify UI consistency across editors
- Test with various content types
- Verify error handling

## Pull Request Process

1. Update documentation for any changes
2. Ensure all tests pass
3. Update README.md if needed
4. Create PR from feature branch to `dev`
5. Request review from at least one team member
6. Address feedback promptly

### PR Requirements

- Clear description of changes
- Link to relevant issues
- Screenshots for UI changes
- Testing instructions
- Updated documentation

## Release Process

1. Merge to `dev` branch
2. Ensure CI is green
3. Create release PR from `dev` to `main`
4. Update version numbers
5. Create GitHub release
6. Deploy to WordPress.org (if applicable)

## Security Considerations

- Never commit API keys or secrets
- Use nonces for all AJAX requests
- Validate all user inputs
- Escape all outputs
- Follow WordPress security best practices
- Run security scans before releases

## Getting Help

- Check existing issues and documentation
- Ask questions in GitHub Discussions
- Review code comments and PHPDoc
- Reference WordPress developer resources

## Code of Conduct

Be respectful, constructive, and inclusive. We're here to build great software together.

## License

By contributing, you agree that your contributions will be licensed under GPLv2 or later.
