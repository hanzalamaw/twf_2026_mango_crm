import { getDescriptionText } from '../utils/orderTags';

const textStyle = {
  whiteSpace: 'pre-line',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  lineHeight: 1.45,
  maxWidth: '220px',
  color: '#333',
  fontWeight: 500,
};

/** Description column — text only (row color still reflects affluent / special request). */
export default function OrderDescriptionCell({ source }) {
  const descriptionText = getDescriptionText(source);

  if (!descriptionText) {
    return <span style={{ color: '#ccc' }}>—</span>;
  }

  return <div style={textStyle}>{descriptionText}</div>;
}
