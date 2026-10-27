// Side-effect module: imported first by main.ts so the sub-path patch is in place before any other
// module makes a request. A no-op unless the build set VITE_BASE_PATH (see services/base-path.ts).
import { installBasePathPatch } from '@/services/base-path';

installBasePathPatch();
