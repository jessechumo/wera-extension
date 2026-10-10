import { Card, Button } from './ui';

export function NeedJob({ what, onNeedJob }: { what: string; onNeedJob: () => void }) {
  return (
    <Card>
      <p className="text-xs text-muted">Save this job to Wera first, so the {what} is written for it.</p>
      <Button className="mt-2" onClick={onNeedJob}>Go to Job</Button>
    </Card>
  );
}
