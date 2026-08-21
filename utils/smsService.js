const axios = require('axios');
const config = require('../config');

const BASE_URL = 'https://api.grizzlysms.com/stubs/handler_api.php';
const API_KEY = process.env.GRIZZLY_API_KEY;

async function getCountryDictionary() {
  try {
    const response = await axios.get(BASE_URL, {
      params: { api_key: API_KEY, action: 'getCountries' }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch country dictionary:', error.message);
    return {};
  }
}

async function getAvailableCountriesForService(serviceCode = 'wa') {
  try {
    const [countryMap, pricesResponse] = await Promise.all([
      getCountryDictionary(),
      axios.get(BASE_URL, {
        params: { api_key: API_KEY, action: 'getPrices', service: serviceCode }
      }).then(res => res.data)
    ]);
    
    // Debug log
    console.log('CountryMap:', JSON.stringify(countryMap, null, 2));

    if (typeof pricesResponse === 'string') {
      console.error(`API Error: ${pricesResponse}`);
      return [];
    }

    const availableCountries = [];

    for (const [countryId, services] of Object.entries(pricesResponse)) {
      if (services[serviceCode]) {
        const { cost, count } = services[serviceCode];

        if (count > 0) {
          // Debug log
          const rawCountryData = countryMap[countryId];
          console.log(`Mapping ID ${countryId} to`, rawCountryData);

          availableCountries.push({
            countryId: parseInt(countryId, 10),
            countryName: rawCountryData ? rawCountryData.eng : `Unknown (${countryId})`,
            dialCode: rawCountryData ? rawCountryData.dialCode : null, // Added dialCode
            price: Number(cost) + 1, // Markup
            stock: count,
          });
        }
      }
    }

    return availableCountries;
  } catch (error) {
    console.error('Request failed:', error.message);
    throw error;
  }
}

async function getNumber(countryId, serviceCode = 'wa') {
  try {
    const response = await axios.get(BASE_URL, {
      params: { api_key: API_KEY, action: 'getNumber', service: serviceCode, country: countryId }
    });
    // Expected response format: "ACCESS_NUMBER:ID:PHONE"
    return response.data;
  } catch (error) {
    console.error('getNumber error:', error.message);
    throw error;
  }
}

async function getStatus(activationId) {
  try {
    const response = await axios.get(BASE_URL, {
      params: { api_key: API_KEY, action: 'getStatus', id: activationId }
    });
    return response.data;
  } catch (error) {
    console.error('getStatus error:', error.message);
    throw error;
  }
}

async function setStatus(activationId, status) {
  try {
    const response = await axios.get(BASE_URL, {
      params: { api_key: API_KEY, action: 'setStatus', id: activationId, status: status }
    });
    return response.data;
  } catch (error) {
    console.error('setStatus error:', error.message);
    throw error;
  }
}

module.exports = {
  getAvailableCountriesForService,
  getNumber,
  getStatus,
  setStatus
};
