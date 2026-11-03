# Project document browser

The Documents sidebar destination keeps its existing administrator visibility and project switcher. It reads the same immutable project library and uses the existing GitHub sync action; it grants no new access and does not edit repository documents.

The view groups files by repository directory, searches names and content locally, and retains the selected document while filtering. No results has an explicit clear action. Snapshot metadata is collapsed by default; source links point to the pinned commit. Primary design and supplemental reference labels remain distinct.

Document content remains escaped Markdown source. The optional outline recognizes ATX headings outside fenced blocks and moves keyboard focus to the selected section. Empty libraries/documents are supported. Desktop has separate browse/read panes; mobile stacks them with bounded scrolling. All colors use the existing semantic theme tokens.

Validation: npm run check (401 tests and production build); isolated synthetic UI preview, search by content/no results, outline focus, light/dark screenshots, and overflow checks at 1440×900, 1280×800, 1024×768 and 390×844. Authenticated production data and production sync were not exercised.
