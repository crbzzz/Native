import FrameworkStudio from './FrameworkStudio';

interface Props {
  onBack: () => void;
}

export default function FiveM({ onBack }: Props) {
  return (
    <FrameworkStudio
      title="  " 
      onBack={onBack}
      defaultFrameworkId="esx"
      frameworks={[
        {
          id: 'esx',
          label: 'ESX',
          hint: 'ESX (es_extended) est un framework RP historique sur FiveM.',
        },
        {
          id: 'qbcore',
          label: 'QBCore',
          hint: 'QBCore est un framework RP moderne (souvent avec qb-* resources).',
        },
        {
          id: 'qbox',
          label: 'Qbox',
          hint: 'Qbox (QBX) est une variante/évolution autour de l’écosystème QBCore.',
        },
        {
          id: 'vrp',
          label: 'vRP',
          hint: 'vRP est un framework RP alternatif, utilisé sur certains serveurs.',
        },
      ]}
    />
  );
}
