# Contributing to CodeWhy

Thank you for your interest in contributing to **CodeWhy**! We welcome bug reports, documentation improvements, architectural test cases, and feature enhancements.

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Please be respectful and constructive in all discussions, pull requests, and issue comments.

## How to Contribute

### Reporting Bugs
- Check the [existing issues](https://github.com/overfitlabs/codewhy/issues) to ensure the bug hasn't already been reported.
- Open a new issue with a clear title, reproduction steps, expected behavior, and relevant logs.

### Submitting Pull Requests
1. **Fork** the repository and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/codewhy.git
   cd codewhy
   ```
2. **Create a feature branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Follow architectural principles**:
   - **Evidence-First**: Never synthesize ungrounded explanations without primary evidence records (commits, PRs, ADRs, manifests).
   - **Epistemic Honesty**: If documentation is unrecorded or premises are contradicted, preserve calibrated abstention rather than speculating.
   - **Isolation**: Keep repository evidence and graph caches strictly partitioned by `repoFullName`.
5. **Run test suites**:
   Ensure all automated tests pass with 0 failures before submitting:
   ```bash
   npm test
   ```
6. **Submit PR**:
   Open a pull request against the `main` branch with a clear description of your changes and test verification.

## Development Commands

```bash
# Start backend and frontend concurrently
npm run dev

# Run full test suite (94 passing tests)
npm test

# Build production client bundle
npm run build

# Start production server
npm start
```

