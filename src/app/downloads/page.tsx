import { listarDownloadsPublicos } from "@/lib/downloads/downloads";
import { DownloadsPageClient } from "@/modules/downloads/components/DownloadsPageClient";

export default async function DownloadsPage() {
  const downloads = await listarDownloadsPublicos();

  return <DownloadsPageClient downloads={downloads} />;
}
