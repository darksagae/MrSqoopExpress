import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { TrackOrder } from './components/TrackOrder'
import { AdminPage } from './components/AdminPage'
import { isAdminHost } from './lib/site'
import reloadLogo from '../logo/reload.png'

const Preloader = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, transition: { duration: 0.8, ease: 'easeInOut' } }}
    className="fixed inset-0 z-[999] bg-white flex items-center justify-center"
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-4 px-6"
    >
      <img
        src={reloadLogo}
        alt="Mr Sqoop Express"
        className="h-auto w-full max-w-xs select-none md:max-w-sm"
        draggable={false}
      />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: '100%' }}
        transition={{ delay: 0.5, duration: 1.5, ease: 'easeInOut' }}
        className="h-px bg-black/20 w-32"
      />
    </motion.div>
  </motion.div>
)

export default function App() {
  const [loading, setLoading] = useState(true)
  const isAdmin = isAdminHost()

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <AnimatePresence mode="wait">
        {loading && <Preloader key="preloader" />}
      </AnimatePresence>

      {!loading && (
        <motion.main
          className="min-h-screen bg-black"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {isAdmin ? <AdminPage /> : <TrackOrder />}
        </motion.main>
      )}
    </>
  )
}
