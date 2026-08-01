import { BusinessIntelligencePage } from '@/features/executive-intelligence/business-intelligence-page';

export default async function Page({
  params,
}: {
  readonly params: Promise<{ view: string }>;
}): Promise<React.ReactElement> {
  const { view } = await params;
  return <BusinessIntelligencePage view={view} />;
}
