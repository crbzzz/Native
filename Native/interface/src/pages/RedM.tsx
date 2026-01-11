import FrameworkStudio from './FrameworkStudio';

interface Props {
  onBack: () => void;
}

export default function RedM({ onBack }: Props) {
  return (
    <FrameworkStudio
      title="  "
      onBack={onBack}
      defaultFrameworkId="vorp"
      frameworks={[
        {
          id: 'vorp',
          label: 'VORP',
          hint: 'VORP (VorpCore) est un framework roleplay populaire côté RedM.',
        },
        {
          id: 'rsg',
          label: 'RSG',
          hint: 'RSG (RSGCore) est un autre framework roleplay courant côté RedM.',
        },
      ]}
    />
  );
}
