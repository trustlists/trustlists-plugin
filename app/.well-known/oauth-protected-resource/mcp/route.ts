import { metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { protectedResourceMetadataResponse } from '../../../oauth';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return protectedResourceMetadataResponse(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
