import FrameworkStudio from './FrameworkStudio';

interface Props {
  onBack: () => void;
}

export default function CodeStudio({ onBack }: Props) {
  return (
    <FrameworkStudio
      title="Code Studio"
      onBack={onBack}
      mode="code"
      showPersonalMenu
      showTopBar
    />
  );
}
