# Reviewer account

Create this account in the trustlists admin console or Supabase Auth. Keep the password in the team password manager. Do not commit it, paste it into a pull request, or put it in `marketplaces/openai/`.

## Requirements

- A new account used only for marketplace review. Do not reuse a personal or customer account.
- Email and password sign-in that works in a fresh private browser.
- No MFA, SMS prompt, email code, magic link, or device-approval step.
- Google or Microsoft login is a poor fit for OpenAI review because those providers can insert a challenge the reviewer cannot bypass.
- At least five Companion credits so one SOC 2 preview can be explained. Do not spend them during ordinary review.
- Requester profile completed with obvious sample data, for example "Marketplace Reviewer", "trustlists", and "Security Review".
- `termsAccepted` saved only for this sample account.
- One SafeBase or Vanta vendor identified for preview tests. Do not confirm a live submission unless the vendor is a trustlists-owned test portal.

## Login details to enter in review dashboards

| Field | Value |
| --- | --- |
| Login URL | `https://app.trustlists.org` |
| Hosted MCP | `https://mcp.trustlists.org/mcp` |
| Email | the dedicated reviewer address |
| Password | stored outside git |
| Tenant or workspace | trustlists production account, not a separate tenant |
| Sample manifest | the `package.json` in `docs/REVIEWER_TESTS.md` |

Claude does not take the password in its portal. If a listing enters Verified review, send the same credentials only in reply to Anthropic's email request.

## Provisioning checklist

1. Create the user and set a long random password.
2. Sign in from a clean browser profile and confirm there is no second factor.
3. Open Companion, confirm the credit balance, and complete the requester profile.
4. Run `trustlists_whoami` through the hosted MCP with that account.
5. Run the five positive prompts and three negative prompts in `docs/REVIEWER_TESTS.md`.
6. Store the email, password, and the date of the clean-browser check in the password manager.
7. Rotate the password after each completed marketplace review.
