import random
from typing import List

australia = [
    # Major Cities
    "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Newcastle", 
    "Canberra", "Sunshine Coast", "Wollongong", "Hobart", "Geelong", "Townsville", "Cairns", 
    "Darwin", "Toowoomba", "Ballarat", "Bendigo", "Albury", "Launceston", "Mackay", 
    "Rockhampton", "Bunbury", "Bundaberg", "Coffs Harbour", "Wagga Wagga", "Hervey Bay", 
    "Mildura", "Shepparton", "Gladstone", "Port Macquarie", "Tamworth", "Orange", "Dubbo", 
    "Geraldton", "Nowra", "Bathurst", "Warrnambool", "Albany", "Kalgoorlie", "Mount Gambier", 
    "Lismore", "Nelson Bay", "Maryborough", "Gympie", "Alice Springs", "Devonport", 
    "Burnie", "Mount Isa", "Broken Hill", "Gawler", "Whyalla", "Murray Bridge", "Port Lincoln",
    "Port Pirie", "Port Augusta", "Goulburn", "Armidale", "Griffith", "Cessnock", "Maitland",
    "Tweed Heads", "Queanbeyan", "Grafton", "Ballina", "Singleton", "Raymond Terrace",
    "Kurri Kurri", "Batemans Bay", "Ulladulla", "Lithgow", "Bowral", "Mittagong", "Moss Vale",
    
    # States & Territories
    "New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia",
    "Tasmania", "Northern Territory", "Australian Capital Territory",
    "NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT",
    
    # Regions
    "Hunter Region", "Central Coast", "Illawarra", "Riverina", "New England", "Mid North Coast",
    "Gippsland", "Goulburn Valley", "Wimmera", "Mallee", "Mornington Peninsula", "Yarra Valley",
    "Barossa Valley", "Riverland", "Eyre Peninsula", "Yorke Peninsula", "Fleurieu Peninsula",
    "Pilbara", "Kimberley", "Goldfields", "Mid West", "South West", "Great Southern",
    "Darling Downs", "Wide Bay-Burnett", "Fitzroy", "Mackay-Whitsunday", "Northern Queensland",
    "Far North Queensland",
    
    # Sydney Suburbs & Surrounds
    "Parramatta", "Blacktown", "Penrith", "Campbelltown", "Liverpool", "Bankstown", "Hornsby",
    "Chatswood", "Ryde", "Manly", "Bondi", "Cronulla", "Newtown", "Surry Hills", "Paddington",
    "Coogee", "Randwick", "Marrickville", "Castle Hill", "Baulkham Hills", "Richmond", "Windsor",
    "Brookvale", "Dee Why", "Narrabeen", "Mona Vale", "Palm Beach", "Epping", "Macquarie Park",
    "Carlingford", "Auburn", "Lidcombe", "Strathfield", "Burwood", "Ashfield", "Leichhardt",
    "Balmain", "Glebe", "Redfern", "Alexandria", "Mascot", "Kensington", "Kingsford", "Maroubra",
    "Hurstville", "Kogarah", "Rockdale", "Sutherland", "Miranda", "Engadine", "Gymea", "Caringbah",
    "St Marys", "Mount Druitt", "Quakers Hill", "Kellyville", "Rouse Hill", "Bella Vista",
    "Stanmore", "Petersham", "Enmore", "Dulwich Hill", "Lewisham", "Summer Hill", "Haberfield",
    "Five Dock", "Drummoyne", "Concord", "Rhodes", "Homebush", "Berala", "Regents Park",
    "Chester Hill", "Villawood", "Yennora", "Guildford", "Merrylands", "Harris Park",
    "Westmead", "Wentworthville", "Pendle Hill", "Toongabbie", "Seven Hills", "Kings Park",
    "Lalor Park", "Doonside", "Rooty Hill", "Minchinbury", "Mount Druitt", "St Marys",
    "Kingswood", "Werrington", "Emu Plains", "Glenmore Park", "Orchard Hills", "Colyton",
    
    # Melbourne Suburbs & Surrounds
    "Richmond", "Fitzroy", "Collingwood", "Brunswick", "Carlton", "St Kilda", "South Yarra",
    "Prahran", "Toorak", "Hawthorn", "Kew", "Camberwell", "Malvern", "Brighton", "Sandringham",
    "Cheltenham", "Dandenong", "Frankston", "Werribee", "Footscray", "Sunshine", "St Albans",
    "Keilor", "Essendon", "Moonee Ponds", "Coburg", "Preston", "Northcote", "Thornbury",
    "Heidelberg", "Ivanhoe", "Doncaster", "Box Hill", "Ringwood", "Croydon", "Mooroolbark",
    "Lilydale", "Warrandyte", "Eltham", "Greensborough", "Bundoora", "Reservoir", "Broadmeadows",
    "Glenroy", "Tullamarine", "Sunbury", "Melton", "Bacchus Marsh", "Williamstown", "Altona",
    "Port Melbourne", "Albert Park", "Middle Park", "Elsternwick", "Caulfield", "Carnegie",
    "Murrumbeena", "Glen Huntly", "Ormond", "Bentleigh", "Moorabbin", "Highett", "Hampton",
    "Black Rock", "Beaumaris", "Mentone", "Parkdale", "Mordialloc", "Aspendale", "Edithvale",
    "Chelsea", "Bonbeach", "Carrum", "Seaford", "Kananook", "Langwarrin", "Somerville",
    "Hastings VIC", "Flinders", "Portsea", "Sorrento", "Rye", "Rosebud", "Dromana", "Safety Beach",
    "Mount Martha", "Mornington", "Mount Eliza", "Frankston South", "Karingal", "Patterson Lakes",
    
    # Brisbane Suburbs & Surrounds
    "Fortitude Valley", "West End", "South Brisbane", "Paddington", "Spring Hill", "New Farm",
    "Milton", "Auchenflower", "Toowong", "Indooroopilly", "St Lucia", "Graceville", "Sherwood",
    "Corinda", "Sunnybank", "Mount Gravatt", "Carindale", "Wynnum", "Manly QLD", "Cleveland",
    "Capalaba", "Redland Bay", "Victoria Point", "Chermside", "Nundah", "Clayfield", "Ascot",
    "Hamilton QLD", "Bulimba", "Hawthorne QLD", "Morningside", "Cannon Hill", "Carina",
    "Annerley", "Yeronga", "Moorooka", "Coopers Plains", "Acacia Ridge", "Inala", "Forest Lake",
    "Ipswich", "Springfield Lakes", "Redbank Plains", "Goodna", "Kangaroo Point", "Woolloongabba",
    "Dutton Park", "Highgate Hill", "Fairfield QLD", "Tennyson", "Yeerongpilly", "Rocklea",
    "Salisbury QLD", "Archerfield", "Coopers Plains", "Macgregor", "Robertson", "Eight Mile Plains",
    "Runcorn", "Kuraby", "Stretton", "Calamvale", "Algester", "Sunnybank Hills", "Pallara",
    "Willawong", "Sherwood", "Graceville", "Chelmer", "Oxley", "Darra", "Jamboree Heights",
    "Mount Ommaney", "Jindalee", "Kenmore", "Chapel Hill", "Fig Tree Pocket", "Bellbowrie",
    
    # Perth Suburbs & Surrounds
    "Fremantle", "Joondalup", "Mandurah", "Subiaco", "Claremont", "Cottesloe", "Nedlands",
    "Dalkeith", "Peppermint Grove", "Mosman Park", "Northbridge", "Leederville", "Mount Lawley",
    "Victoria Park", "South Perth", "Applecross", "Como", "Belmont", "Midland", "Armadale WA",
    "Kelmscott", "Rockingham", "Kwinana", "Baldivis", "Wanneroo", "Scarborough WA", "Innaloo",
    "Osborne Park", "Morley", "Bayswater WA", "Bassendean", "Guildford WA", "Cannington",
    "East Perth", "West Perth", "Highgate WA", "Mount Hawthorn", "Wembley", "Floreat",
    "City Beach", "Swanbourne", "Shenton Park", "Karrakatta", "Crawley WA", "Attadale",
    "Bicton", "Palmyra", "Melville", "Willagee", "Myaree", "Booragoon", "Ardross",
    "Mount Pleasant WA", "Brentwood", "Bull Creek", "Bateman", "Winthrop", "Kardinya",
    
    # Adelaide Suburbs & Surrounds
    "North Adelaide", "Glenelg", "Brighton SA", "Henley Beach", "Semaphores", "Port Adelaide",
    "Norwood", "Burnside", "Unley", "Mitcham", "Marion", "Hallett Cove", "Noarlunga",
    "Morphett Vale", "Aldinga", "Willunga", "McLaren Vale", "Stirling", "Crafers", "Mount Barker",
    "Hahndorf", "Gumeracha", "Birdwood", "Lobethal", "Gawler East", "Elizabeth", "Salisbury SA",
    "Mawson Lakes", "Golden Grove", "Modbury", "Tea Tree Gully", "Campbelltown SA", "Payneham",
    "Walkerville", "Prospect SA", "Enfield", "Kilburn", "Gepps Cross", "Dry Creek",
    "Mawson Lakes", "Parafield", "Salisbury Downs", "Salisbury North", "Salisbury East",
    "Golden Grove", "Greenwith", "Wynn Vale", "Modbury Heights", "Hope Valley", "Highbury",
    "Dernancourt", "Athelstone", "Paradise", "Newton SA", "Rostrevor", "Magill", "Tranmere",
    
    # Additional Regional Towns
    "Katoomba", "Blackheath", "Springwood", "Penrith", "Windsor", "Richmond", "Hawkesbury",
    "Gosford", "Wyong", "Tuggerah", "The Entrance", "Terrigal", "Avoca Beach", "Bateau Bay",
    "Umina Beach", "Ettalong Beach", "Woy Woy", "Kincumber", "Green Point", "Erina",
    "Singleton", "Muswellbrook", "Scone", "Murrurundi", "Gunnedah", "Narrabri", "Moree",
    "Lightning Ridge", "Walgett", "Bourke", "Cobar", "Nyngan", "Gilgandra", "Coonamble",
    "Coonabarabran", "Wellington NSW", "Parkes", "Forbes", "Condobolin", "West Wyalong",
    "Temora", "Cootamundra", "Junee", "Gundagai", "Tumut", "Yass", "Murrumbateman",
    "Young NSW", "Cowra", "Grenfell", "Canowindra", "Molong", "Orange NSW", "Bathurst NSW"
]

def _generate_cities_variations(region: str, count: int) -> List[str]:
    region_lower = region.strip().lower()
    
    if "australia" in region_lower:
        base_list = australia
    else:
        base_list = ["Local City Center"]

    result = list(base_list)
    random.shuffle(result)
    
    if region.title() not in result:
        result.insert(0, region.title())
        
    if len(result) < count:
        directions = ["North", "South", "East", "West", "Greater", "Central", "Metro", "Valley", "Coast", "Heights"]
        extra = []
        sample_cities = base_list[:15] if len(base_list) >= 15 else base_list
        for city in sample_cities:
            for d in directions:
                comb = f"{d} {city}"
                if comb not in result and comb not in extra:
                    extra.append(comb)
        random.shuffle(extra)
        result.extend(extra)
        
    return result[:count]

try:
    res = _generate_cities_variations("Australia", 500)
    print(f"SUCCESS: Generated {len(res)} cities.")
    print(f"Count of unique items: {len(set(res))}")
    print(res[:10])
except Exception as e:
    print(f"FAILED: {e}")
