# Security Policy

Security issues should be handled carefully and privately.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities, exposed credentials, authentication bypasses, authorization issues, or user-data exposure in a public GitHub issue.

If GitHub private vulnerability reporting is available for this repository, use that channel. Otherwise, contact the repository maintainer privately through GitHub before sharing sensitive technical details.

A useful report should include:

- A clear description of the issue
- The affected area or file
- Reproduction steps where safe
- The likely impact
- Any suggested remediation

## Secrets

Do not commit API keys, access tokens, database credentials, private certificates, service-role keys, or other secrets.

If a secret is accidentally committed, removing it from the latest file is not sufficient. Revoke or rotate the credential immediately and assess whether repository history also requires remediation.

## Scope

ZeteChat is currently in early development. Security expectations and supported versions will be documented more precisely as the application code is published.
