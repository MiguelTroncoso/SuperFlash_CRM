import { Customer360Page } from '@/features/executive-intelligence/customer-360-page';

export default async function Page({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <Customer360Page contactId={id} />;
}
