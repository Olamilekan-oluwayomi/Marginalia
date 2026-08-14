# Marginalia — Production Smoke Test Checklist

Manual checklist to run against a deployed (or staging) environment before
declaring it healthy. Each item is a pass/fail. Requires two accounts
(Account A and Account B) for the security section, and a valid sample PDF.

## Auth

1. Register a new account (email or Google) and confirm the email if required.
2. Sign in and land on the workspace home.
3. Sign out from the account menu and confirm you're redirected to `/login`.
4. While signed out, visit `/research`, `/documents`, `/settings` — each
   redirects to `/login` (with the intended destination preserved after sign-in).
5. Sign back in and confirm you land where you were headed (not always the home page).

## Research

6. Create a research workspace; confirm you're taken to its page and it
   appears on the home page and the Research list.
7. Open the workspace and confirm the empty states read well (no questions,
   no documents, no sources).
8. Add a source with title, URL, publisher, and pasted body text; confirm it
   appears labeled "Citable".
9. Try adding a source with a duplicate URL — confirm it is rejected with a
   friendly message.
10. Delete a source; confirm the confirmation dialog works and the row disappears.

## Documents

11. Upload a valid PDF into the workspace.
12. Observe the row move through `Pending → Processing → Ready`.
13. Confirm the document is labeled "Searchable as evidence."
14. Upload a non-PDF file, an empty file, and an oversized file — confirm each
    is rejected with a friendly message and no orphaned file remains.
15. Delete a document; confirm the confirmation dialog works, the row is gone,
    and the stored file is removed.
16. If a document can be made to fail processing, confirm the Retry control
    appears and a retry either succeeds or re-fails cleanly.

## AI / questions

17. Ask a question answerable from an uploaded document's content.
18. Confirm the question status shows `Generating` and the answer appears
    without a page reload (polling).
19. Confirm inline `[n]` citation markers render and clicking one scrolls to
    and flashes the matching margin note (or expands it inline on mobile).
20. Ask a question that the evidence cannot answer — confirm the answer says
    plainly what is missing rather than inventing content.
21. Ask a question with "Search the web for sources" enabled — confirm
    discovered sources are saved to the workspace and cited where used.
22. Trigger a failure (e.g. invalid API key temporarily) — confirm the
    question shows `Failed` with a Retry control and a safe message, never a
    raw provider error.
23. Let a question sit in `Generating` past the staleness threshold (5 min) —
    confirm the "Reset question" recovery control appears and a reset followed
    by retry works.

## Security

24. From Account B, attempt to open Account A's workspace URL directly —
    confirm 404, not content.
25. From Account B, attempt to reach Account A's document/source URLs directly
    — confirm they are not accessible.
26. Inspect the HTML/network payloads of a workspace — confirm no document
    body text, no storage file paths, and no `content` fields appear.
27. Confirm no API keys or service-role identifiers appear in any client
    bundle or network request.
28. Confirm source links open in a new tab with `rel="noopener noreferrer"`.

## Responsive

29. Repeat the core flows (ask question, open citations, upload document,
    manage sources) at mobile width (~375px).
30. Confirm no horizontal overflow on any page; long titles wrap; the bottom
    mobile nav works and doesn't cover content.
31. Check tablet (~768px) and desktop (~1280px): the margin rail appears and
    citations scroll correctly; the reading column stays readable.

## Accessibility

32. Complete a full keyboard-only pass: Tab through the home page, sidebar,
    workspace, and dialogs; confirm a visible focus ring at every stop.
33. Confirm skip-to-content works (focus moves to the main region).
34. Open a delete dialog, confirm Escape closes it and focus returns to the
    trigger button.
35. Confirm a screen reader announces question generation and the terminal
    result ("Generating", "Answer complete.", "Answer failed.").
36. Confirm form errors are announced and focus moves to the first invalid field.

## Performance sanity

37. Confirm a workspace with several documents and questions loads quickly and
    the 2s question poller stops once all answers are terminal.
38. Confirm the workspace page payload does not include extracted document
    content (check the network tab for a research page response).
