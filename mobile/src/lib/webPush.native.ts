// Phones use native push (lib/push.ts); browser push is web-only.
export type WebPushState = "unsupported" | "needs-install" | "denied" | "off" | "on";
export const prepareWebPush = () => {};
export const webPushState = async (): Promise<WebPushState> => "unsupported";
export const enableWebPush = async (): Promise<WebPushState> => "unsupported";
export const disableWebPush = async () => {};
