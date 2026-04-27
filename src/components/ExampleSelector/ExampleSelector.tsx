import { examples } from '../../examples';
import styles from './ExampleSelector.module.css';

interface Props {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function ExampleSelector({ selectedIndex, onSelect }: Props) {
  return (
    <div className={styles.container}>
      <label className={styles.label}>Example</label>
      <select
        className={styles.select}
        value={selectedIndex}
        onChange={(e) => onSelect(parseInt(e.target.value))}
      >
        {examples.map((example, i) => (
          <option key={i} value={i}>
            {example.name}
          </option>
        ))}
      </select>
      <span className={styles.description}>{examples[selectedIndex]?.description}</span>
    </div>
  );
}
