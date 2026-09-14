## Technologies

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS | Modules map 1:1 to services → widgets, so /about.json can be generated from the registry. |
| Frontend | React + Vite | react-grid-layout and dnd-kit solve moving and resizing widgets. |
| Styling & UI | Tailwind CSS + shadcn/ui | Responsive variants (sm:, md:, lg:) make the layout responsive quickly. Accessible dialogs, menus, and focus traps for the widget config modal. |
| Widget grid | react-grid-layout | Drag, resize and responsive breakpoints. |
| Database | PostgreSQL + Redis | Relations fit users → subscriptions → widget instances. Cache API responses per (widget, params) to stay under free-tier quotas. |
| Auth | Passport.js + @nestjs/jwt + bcrypt | Local strategy for email + password; 500+ strategies for Google/GitHub OIDC. |
| Timer | Server scheduler + WebSocket | Matches the subject literally: widgets register a rate, the server fetches and pushes. |

