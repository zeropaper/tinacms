const branch = 'main'

export default {
  apiURL:
    process.env.NODE_ENV == 'development'
      ? 'http://localhost:4001/graphql'
      : `https://content.tinajs.io/content/${process.env.NEXT_PUBLIC_TINA_CLIENT_ID}/github/${branch}`,
  cmsCallback: (cms) => {
    cms.flags.set('tina-admin', true)
  },
}
