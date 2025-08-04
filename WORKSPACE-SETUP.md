# MAIA New Workspace - GitHub Directory

## Location
`/Users/adrian/Desktop/HIEofOne-dev/GitHub/MAIA-new`

## Structure
```
HIEofOne-dev/
├── FHIR-to-MD/
├── GitHub/
│   ├── HIEofOne-local-dev/
│   ├── MAIA-new/                    # ← New clean workspace
│   │   ├── .env                     # Environment configuration
│   │   ├── .gitignore               # Git ignore rules
│   │   ├── index.html               # Entry point
│   │   ├── LICENSE                  # MIT license
│   │   ├── MAIA-new.code-workspace # Cursor workspace file
│   │   ├── node_modules/            # Dependencies
│   │   ├── package.json             # Project configuration
│   │   ├── package-lock.json        # Dependency lock
│   │   ├── public/                  # Static assets
│   │   ├── README.md                # Project documentation
│   │   ├── server.js                # Express server
│   │   ├── src/                     # Vue.js frontend
│   │   ├── tsconfig*.json           # TypeScript config
│   │   └── vite.config.ts           # Vite build config
│   ├── MAIA-vue-ai-example/
│   ├── nosh3/
│   ├── Trustee-Community/
│   ├── Trustee-Proxy/
│   ├── vue3-gnap/
│   └── welcome-to-docker/
└── Local/
```

## Benefits
- **Clean Structure**: Only essential files
- **Peer to Other GitHub Workspaces**: Located in GitHub directory with other projects
- **Single Environment**: One .env file for all configuration
- **No Legacy Components**: Removed Docker, Trustee, NOSH3 references
- **Ready for Development**: Minimal, focused codebase

## Next Steps
1. Open `MAIA-new.code-workspace` in Cursor
2. Configure `.env` with actual credentials
3. Test local development: `npm start`
4. Debug any issues
5. Deploy to cloud when ready
