interface CityMetadata {
  population: number;
  area: number;
  baselineCrimeRate: number;
  reportingMethodology: string;
}

interface NormalizationFactors {
  populationDensity: number;
  regionalCrimeRate: number;
  methodologyAdjustment: number;
}

function calculateNormalizationFactors(cityData: CityMetadata): NormalizationFactors {
  const populationDensity = cityData.population / cityData.area;
  
  // Adjust scores based on population density
  // More dense areas tend to have higher crime rates naturally
  const densityFactor = Math.log10(populationDensity) / 5;
  
  // Compare city's crime rate to national average
  const crimeRateFactor = cityData.baselineCrimeRate / nationalAverageCrimeRate;
  
  // Adjust for different reporting methods
  const methodologyFactor = getMethodologyAdjustment(cityData.reportingMethodology);
  
  return {
    populationDensity: densityFactor,
    regionalCrimeRate: crimeRateFactor,
    methodologyAdjustment: methodologyFactor
  };
}

function normalizeScore(rawScore: number, factors: NormalizationFactors): number {
  // Apply normalization factors
  const normalizedScore = rawScore 
    * (1 / factors.populationDensity)
    * (1 / factors.regionalCrimeRate)
    * factors.methodologyAdjustment;
    
  // Ensure score stays within 0-100 range
  return Math.min(Math.max(normalizedScore, 0), 100);
}

const nationalAverageCrimeRate = 2800; // Crimes per 100,000 people

function getMethodologyAdjustment(methodology: string): number {
  // Different cities might count crimes differently
  // This normalizes based on reporting methodology
  const methodologyFactors: { [key: string]: number } = {
    'UCR': 1.0,      // FBI Uniform Crime Reporting
    'NIBRS': 0.85,   // National Incident-Based Reporting System
    'custom': 0.9    // City-specific reporting
  };
  
  return methodologyFactors[methodology] || 1.0;
}

export { calculateNormalizationFactors, normalizeScore };
export type { CityMetadata, NormalizationFactors }; 