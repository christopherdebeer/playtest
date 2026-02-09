import Hero from '../components/Hero'
import UsageSection from '../components/UsageSection'
import GamesSection from '../components/GamesSection'
import RecentPlaytests from '../components/RecentPlaytests'
import MechanicsSection from '../components/MechanicsSection'
import ArchitectureSection from '../components/ArchitectureSection'

function HomePage() {
  return (
    <>
      <Hero />
      <UsageSection />
      <GamesSection />
      <RecentPlaytests />
      <MechanicsSection />
      <ArchitectureSection />
    </>
  )
}

export default HomePage
