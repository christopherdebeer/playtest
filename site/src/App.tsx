import Header from './components/Header'
import Hero from './components/Hero'
import UsageSection from './components/UsageSection'
import GamesSection from './components/GamesSection'
import MechanicsSection from './components/MechanicsSection'
import ArchitectureSection from './components/ArchitectureSection'
import Footer from './components/Footer'
import './App.css'

function App() {
  return (
    <div className="app">
      <Header />
      <main>
        <Hero />
        <UsageSection />
        <GamesSection />
        <MechanicsSection />
        <ArchitectureSection />
      </main>
      <Footer />
    </div>
  )
}

export default App
