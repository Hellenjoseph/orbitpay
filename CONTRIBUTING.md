# Contributing to StellarWhisper 🤝

Thank you for your interest in contributing to **StellarWhisper**! As a privacy-focused open-source project powered by Stellar, we hold our code quality, safety, and decentralization principles to a high standard.

Please follow these guidelines to make sure your contribution is accepted.

---

## 🚀 Quick Start Checklist

1. **Fork** the repository and clone it locally.
2. Ensure you have **Node.js >= 18.x** and **pnpm** installed.
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a branch named according to our convention:
   ```bash
   git checkout -b fix-[issue-number]
   # Example: git checkout -b fix-102
   ```
   *Note: Only submit PRs for issues you are explicitly assigned to.*

---

## 🛠️ Development & Coding Guidelines

* **TypeScript**: Use strict types. Avoid using `any` unless absolutely necessary.
* **Tailwind CSS**: Follow our dark, rich design aesthetic. Maintain layout responsiveness.
* **Clean Code**: Keep components small, modular, and reusable.
* **Preserve Documentation**: Do not remove or alter existing code comments or documentation unless requested.

### Testing Your Changes

Always run the build and smoke tests before committing:

1. Validate the Next.js compilation:
   ```bash
   pnpm build
   ```
2. Verify API security via smoke tests:
   1. In one terminal, start the development server: `pnpm dev`
   2. In another terminal, run: `pnpm run test:vote-remove`
   3. Ensure all tests report green (success).

---

## 📥 Submitting a Pull Request

1. Push your branch to your origin fork.
2. Open a Pull Request against the `main` branch of the main repository.
3. Describe your changes clearly in the PR description, referencing the issue number.
4. Ensure all CI checks (linting, build, testing) pass successfully.
5. A reviewer will look at your PR and provide feedback. Once approved, it will be merged!

---

## 📜 Code of Conduct

We are dedicated to providing a harassment-free experience for everyone. Be respectful, helpful, and collaborative.
