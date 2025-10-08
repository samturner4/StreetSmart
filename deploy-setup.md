# Production Deployment Setup

## Step 1: Git Setup (Run in PowerShell as Administrator)

```powershell
# Navigate to project directory
cd "C:\Users\samjt\Documents\Cursor\Projects\Walk Safe App"

# Initialize Git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - Walk Safe App"

# Add remote repository (create on GitHub first)
git remote add origin https://github.com/YOUR_USERNAME/walk-safe-app.git

# Push to GitHub
git push -u origin main
```

## Step 2: Vercel Deployment

1. Go to [vercel.com](https://vercel.com)
2. Sign up/Login with GitHub
3. Click "New Project"
4. Import your GitHub repository
5. Set build settings:
   - **Framework Preset:** Next.js
   - **Root Directory:** `web`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`

## Step 3: Environment Variables in Vercel

Add these in Vercel dashboard → Project Settings → Environment Variables:

```
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Step 4: Update Mobile App

After Vercel deployment, update `mobile/src/routing/services/MobileRoutingAPI.ts`:

```typescript
private static readonly BASE_URL = __DEV__ 
  ? 'https://your-app-name.vercel.app/api'  // Your Vercel URL
  : 'https://your-app-name.vercel.app/api';   // Same for production
```

## Step 5: Test

1. Deploy to Vercel
2. Update mobile app URL
3. Test routing on mobile device
4. Verify tiles still load from CloudFront

## Development Workflow

- **Local development:** Keep using localhost
- **Beta testing:** Use Vercel URL
- **Code changes:** Push to GitHub → Vercel auto-deploys


