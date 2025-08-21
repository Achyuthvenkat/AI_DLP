import jwt
import datetime

SECRET_KEY = "supersecret_jwt_token_here"

# JWT payload
payload = {
    "user": "dlp_agent",
    "exp": datetime.datetime.utcnow() + datetime.timedelta(days=90)  # expires in 90 days
}

# Generate token
token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

print("JWT Token:", token)
