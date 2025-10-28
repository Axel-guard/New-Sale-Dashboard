# Sales Dashboard (GitHub Pages)

This repository is a self-contained static sales dashboard you can host with GitHub Pages and preview immediately.

Features
- Employee-wise sales overview and graphs (Chart.js)
- Live view for current month + filter by month or "All time"
- Employee filter (click an employee to focus)
- Detailed sales table with: customer name, sale date, products, total, payment status
- Full payment history per sale (supports partial payments and installment details)
- Export filtered data to CSV
- Mobile-friendly responsive UI

How to use (quick)
1. Create a new GitHub repository (or use an existing one).
2. Add the files from this repo to the repository root (index.html, styles.css, app.js, data/sales.json).
3. Commit and push to the `main` branch.
4. Enable GitHub Pages:
   - Go to Settings → Pages
   - Set "Source" to Branch: `main` and Folder: `/ (root)` (or choose `/docs` if you move files there)
   - Save. After a moment GitHub will show your site URL, which will be:
     https://<your-github-username>.github.io/<your-repo>/
5. Click the GitHub Pages URL (the "preview") to open the dashboard.

Notes
- All data is read from `data/sales.json`. You can replace it or update it when you need to add real sales.
- This is a static client-side dashboard — no server required.
- If you want the site available *immediately* inside the repo without enabling Pages, GitHub's file preview will show `index.html` content when you click it; but for a proper URL and live JavaScript, enable GitHub Pages as described above.

What's next (suggestions)
- Replace `data/sales.json` with your real data or connect to a backend API.
- Add authentication if you host private sales data.
- Add date-range filters beyond the monthly filter.
- Add more charts (trend lines, product-wise breakdown).
