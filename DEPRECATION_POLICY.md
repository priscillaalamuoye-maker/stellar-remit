# Deprecation Policy

This document outlines how the stellar-remit project handles feature deprecation, API changes, and end-of-life considerations.

## Semantic Versioning

We follow [Semantic Versioning (SemVer)](https://semver.org/):

- **MAJOR** version: Breaking changes (API, contract state, behavior)
- **MINOR** version: New features, backward compatible
- **PATCH** version: Bug fixes, backward compatible

## Deprecation Timeline

### Announcing Deprecation

When a feature, API, or component is scheduled for removal:

1. **Deprecation Notice**: Added in release notes (CHANGELOG.md)
2. **Timeline**: Announced at least **2 minor versions** before removal
3. **Documentation**: Updated with deprecation warnings and migration paths
4. **Code Markers**: Deprecated code marked with `@deprecated` comments or attributes

### Example Deprecation Cycle

```
v1.0.0 — Feature X introduced
v1.1.0 — Feature X marked for deprecation (removal planned for v1.3.0)
v1.2.0 — Feature X still supported, but warning in documentation
v1.3.0 — Feature X removed (breaking change)
```

## Breaking Changes

### Contract Changes

Smart contract changes that alter state structure, function signatures, or behavior are **breaking changes**:

- Require a **MAJOR version bump**
- Require at least **2 minor versions** deprecation notice
- Must include migration guide for deployed instances
- Should be batched together to minimize upgrade frequency

### Web App API Changes

Changes to the contract ABI or web app APIs:

- New parameters: backward compatible (MINOR version)
- Removed parameters: breaking (MAJOR version)
- Behavior changes: breaking (MAJOR version)
- Must include migration guide in release notes

### Rust/TypeScript Dependencies

Major version bumps of dependencies that affect the public API are treated as **breaking changes**.

## Security Fixes

Security fixes that require behavior changes are expedited:

- Announced immediately in release notes and security advisory
- May include breaking changes with MAJOR version bump
- Earlier deprecation timeline allowed (1 minor version notice minimum)

## End-of-Life

### Version Support

- **Current release**: Full support (bug fixes, features, security)
- **Previous MAJOR version**: Security fixes only
- **Older versions**: No support

### Sunset Timeline

Versions sunset according to:

1. **Announcement**: Deprecation notice in release notes, GitHub discussions
2. **Notice Period**: Minimum 6 months from announcement
3. **End Date**: Version no longer receives security fixes
4. **Removal**: Releases archived; resources removed from primary documentation

## Migration Guides

All deprecations include migration guides:

- **What Changed**: Clear explanation of the change
- **Why**: Rationale for the change
- **How to Migrate**: Step-by-step instructions
- **Timeline**: When the change takes effect
- **Examples**: Before/after code samples
- **Support**: Link to GitHub discussions or issues for questions

## Communication Channels

Deprecations and breaking changes announced via:

1. **CHANGELOG.md**: Comprehensive release notes
2. **GitHub Releases**: Tagged with `breaking-change` label
3. **GitHub Discussions**: Announcement post for feedback
4. **Documentation**: Updated migration guides and warnings

## Versioning Timeline Template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Deprecated

- `function_name()` (removal planned for vX.Y+2.Z)
  - Rationale: [why]
  - Migration: Use `new_function_name()` instead
  - [link to migration guide]

### Breaking Changes

- Removed `old_api` (deprecated in vX.Y-2.Z)
  - Migration: See [migration guide link]
```

## Review Process

Before deprecating features:

1. **Proposal**: Raise issue or discussion for community feedback
2. **Review**: Core maintainers and stakeholders review
3. **Announcement**: Formal deprecation notice in next release
4. **Monitoring**: Track adoption; adjust timeline if needed
5. **Execution**: Remove in planned version

## Questions?

For questions about deprecation timelines or migration paths:

- Open a GitHub issue with label `deprecation`
- Join GitHub Discussions
- Contact maintainers

---

Last Updated: 2026-09-09
