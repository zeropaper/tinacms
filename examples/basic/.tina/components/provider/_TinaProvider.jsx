import TinaCMS from 'tinacms'
import config from '../../config'

// Importing the TinaProvider directly into your page will cause Tina to be added to the production bundle.
// Instead, import the tina/provider/index default export to have it dynamially imported in edit-moode
const TinaProvider = ({ children }) => {
  return <TinaCMS {...config}>{children}</TinaCMS>
}

export default TinaProvider
