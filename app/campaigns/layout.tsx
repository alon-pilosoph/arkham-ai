import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4 pb-16 md:p-8">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeftIcon className="size-4" />
          Chats
        </Link>
        <Link href="/campaigns" className="text-muted-foreground hover:text-foreground">
          Campaigns
        </Link>
      </nav>
      {children}
    </div>
  );
}
