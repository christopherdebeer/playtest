import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      // If there's a hash, try to scroll to that element
      const element = document.querySelector(hash)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      } else {
        // Hash exists but no matching element (e.g., tab state), scroll to top
        window.scrollTo(0, 0)
      }
    } else {
      // No hash, scroll to top
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])

  return null
}

export default ScrollToTop
