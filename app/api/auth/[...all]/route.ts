import { getAuth } from "@/lib/auth";

// Better Auth's endpoints: sign-in, the Google callback, sign-in links, sessions and sign-out.
async function handle(req: Request): Promise<Response> {
  return (await getAuth()).handler(req);
}

export { handle as GET, handle as POST };
