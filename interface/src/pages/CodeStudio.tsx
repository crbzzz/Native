import { useEffect, useState } from 'react';
import FrameworkStudio from './FrameworkStudio';

interface Props {
  onBack: () => void;
}

export default function CodeStudio({ onBack }: Props) {
  const [initialConversationId, setInitialConversationId] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const id = window.localStorage.getItem('native:studio:openConversationId');
      if (id && id.trim()) {
        window.localStorage.removeItem('native:studio:openConversationId');
        setInitialConversationId(id);
      }
    } catch (_) {
      // ignore
    }
  }, []);

  return (
    <FrameworkStudio
      title="Code Studio"
      onBack={onBack}
      mode="code"
      showPersonalMenu
      showTopBar
      initialConversationId={initialConversationId}
    />
  );
}
